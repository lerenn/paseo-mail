import { randomBytes } from "node:crypto";
import { Queue } from "./files";
import { normalize, type Registry } from "./registry";
import type { MailStore } from "./store";
import { UserError, type AgentInfo, type Caller, type Mail, type PaseoPort, type Registration } from "./types";

export interface MailerOptions {
  /** Delay before a nudge after new mail or a turn end, so a burst gives one nudge. */
  debounceMs?: number;
  /** How long a nudge the plugin sent counts as "busy" if no turn starts after it. */
  sendGraceMs?: number;
  /** Retries when an agent still reads as running though no turn start was seen. */
  maxRetries?: number;
  now?: () => string;
}

/** One recipient of a send: the address as typed and the agent it reached. */
export interface Delivery {
  address: string;
  agentId: string;
  name: string | null;
  title: string | null;
  mailId: string;
}

const ROLE_PREFIX = "role:";
const AGENT_PREFIX = "agent:";

export function nudgeText(count: number): string {
  return `[paseo-mail] You have ${count} unread mail${count === 1 ? "" : "s"}. Call mail_list to see them.`;
}

let lastStamp = 0;
let counter = 0;

/** Ids sort in creation order (time, then a counter), so mails sent in the same millisecond list in order. */
function newId(): string {
  const stamp = Date.now();
  counter = stamp === lastStamp ? counter + 1 : 0;
  lastStamp = stamp;
  return `m_${stamp.toString(36)}${counter.toString(36).padStart(3, "0")}${randomBytes(3).toString("hex")}`;
}

/**
 * Mailboxes, the registry of names and roles, and the idle nudge. Mail never goes into a
 * running turn: a nudge is sent only to an agent that reads as idle, and only for unread
 * mail it has not been nudged about (docs/adrs/2026-11-10-idle-nudge.md).
 */
export class Mailer {
  /** Agents in a turn: turn hooks, or a nudge we sent (with the time we sent it). */
  private readonly inTurn = new Set<string>();
  private readonly sentAt = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Name claims run one at a time, so two agents cannot take the same name. */
  private readonly claims = new Queue();
  private disposed = false;
  private readonly debounceMs: number;
  private readonly sendGraceMs: number;
  private readonly maxRetries: number;
  private readonly now: () => string;

  constructor(
    private readonly store: MailStore,
    private readonly registry: Registry,
    private readonly paseo: PaseoPort,
    options: MailerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 1000;
    this.sendGraceMs = options.sendGraceMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 5;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // ---------------------------------------------------------------- registry

  /** Applies a registration change for the caller and returns the result. */
  register(caller: Caller, input: { name?: string; roles?: string[] }): Promise<Registration | null> {
    return this.claims.run(async () => {
      const current = this.registry.get(caller.id);
      let name = current?.name ?? null;
      if (input.name !== undefined) {
        name = input.name.trim() === "" ? null : normalize(input.name, "name");
        if (name !== null && name !== current?.name) {
          const holder = this.registry.holderOf(name);
          if (holder && holder.agentId !== caller.id) {
            const agent = await this.live(holder.agentId);
            if (agent) throw new UserError(`the name "${name}" is held by another agent (${describe(agent)}); pick another name`);
          }
        }
      }
      const roles = input.roles === undefined ? (current?.roles ?? []) : [...new Set(input.roles.map((role) => normalize(role, "role")))].sort();
      if (input.name === undefined && input.roles === undefined) return current ?? null;
      const projectId = current?.projectId ?? (caller.workspaceId ? await this.paseo.projectOf(caller.workspaceId).catch(() => null) : null);
      const entry: Registration = { agentId: caller.id, name, roles, workspaceId: caller.workspaceId, projectId, updatedAt: this.now() };
      await this.registry.set(entry);
      return name === null && roles.length === 0 ? null : entry;
    });
  }

  /** Registered agents that are still live. Dead entries are dropped on the way. */
  async directory(): Promise<{ registration: Registration; agent: AgentInfo }[]> {
    const result: { registration: Registration; agent: AgentInfo }[] = [];
    for (const registration of this.registry.list()) {
      const agent = await this.live(registration.agentId);
      if (agent) result.push({ registration, agent });
    }
    return result;
  }

  /** Resolves one address to the live agents it reaches. Throws when it reaches none. */
  async resolve(caller: Caller, address: string): Promise<{ agentId: string; registration: Registration | null; agent: AgentInfo }[]> {
    const trimmed = address.trim();
    if (trimmed.toLowerCase().startsWith(AGENT_PREFIX)) {
      // An agent id needs no registry entry (docs/adrs/2026-11-10-agent-id-addressing.md). Ids are case-sensitive.
      const id = trimmed.slice(AGENT_PREFIX.length).trim();
      if (id === "") throw new UserError('give an agent id after "agent:"');
      const agent = await this.live(id);
      if (!agent) throw new UserError(`no live agent has the id "${id}" (it does not exist or is archived)`);
      if (agent.id === caller.id) throw new UserError("you cannot send mail to yourself");
      return [{ agentId: agent.id, registration: this.registry.get(agent.id) ?? null, agent }];
    }
    if (trimmed.toLowerCase().startsWith(ROLE_PREFIX)) {
      const role = normalize(trimmed.slice(ROLE_PREFIX.length), "role");
      const holders: { agentId: string; registration: Registration; agent: AgentInfo }[] = [];
      for (const registration of this.registry.withRole(role)) {
        if (registration.agentId === caller.id) continue;
        const agent = await this.live(registration.agentId);
        if (agent) holders.push({ agentId: agent.id, registration, agent });
      }
      if (holders.length === 0) throw new UserError(`no live agent holds the role "${role}"`);
      const sameWorkspace = caller.workspaceId ? holders.filter((holder) => holder.registration.workspaceId === caller.workspaceId) : [];
      if (sameWorkspace.length > 0) return sameWorkspace;
      const project = await this.projectOfCaller(caller);
      const sameProject = project ? holders.filter((holder) => holder.registration.projectId === project) : [];
      return sameProject.length > 0 ? sameProject : holders;
    }
    const name = normalize(trimmed, "name");
    const registration = this.registry.holderOf(name);
    const agent = registration ? await this.live(registration.agentId) : null;
    if (!registration || !agent) throw new UserError(`no live agent is registered as "${name}" (see mail_directory)`);
    if (agent.id === caller.id) throw new UserError("you cannot send mail to yourself");
    return [{ agentId: agent.id, registration, agent }];
  }

  // ---------------------------------------------------------------- mail

  async send(caller: Caller, to: string[], subject: string, body: string, thread?: { threadId: string; inReplyTo: string }): Promise<Delivery[]> {
    if (to.length === 0) throw new UserError("give at least one address");
    // Resolve everything first, so a bad address sends nothing.
    const targets = new Map<string, { address: string; registration: Registration | null; agent: AgentInfo }>();
    for (const address of to) {
      for (const target of await this.resolve(caller, address)) {
        if (!targets.has(target.agentId)) targets.set(target.agentId, { address: address.trim(), registration: target.registration, agent: target.agent });
      }
    }
    return this.deliver(caller, [...targets.values()], subject, body, thread);
  }

  list(agentId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Mail[] {
    const mails = options.unreadOnly ? this.store.unread(agentId) : this.store.inbox(agentId);
    return mails.slice(0, options.limit ?? 20);
  }

  unreadCount(agentId: string): number {
    return this.store.unread(agentId).length;
  }

  /** Returns a mail to its recipient and marks it read. */
  async read(agentId: string, id: string): Promise<Mail> {
    const mail = this.ownMail(agentId, id);
    if (mail.readAt !== null) return mail;
    const readAt = this.now();
    const [updated] = await this.store.update([id], (current) => {
      current.readAt ??= readAt;
    });
    return updated ?? mail;
  }

  /** Replies to a mail's sender: its agent if live, else whoever holds its name now. */
  async reply(caller: Caller, id: string, body: string): Promise<Delivery> {
    const original = this.ownMail(caller.id, id);
    if (original.from.agentId === null) throw new UserError("this mail came from paseo-mail itself; there is nobody to reply to");
    const subject = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
    const thread = { threadId: original.threadId, inReplyTo: original.id };
    const sender = await this.live(original.from.agentId);
    if (sender) {
      const [delivery] = await this.deliver(caller, [{ address: original.from.name ?? `${AGENT_PREFIX}${sender.id}`, registration: this.registry.get(sender.id) ?? null, agent: sender }], subject, body, thread);
      return delivery!;
    }
    if (!original.from.name) throw new UserError("the sender was archived and had no registered name; the reply cannot be delivered");
    const [delivery] = await this.send(caller, [original.from.name], subject, body, thread);
    return delivery!;
  }

  private ownMail(agentId: string, id: string): Mail {
    const mail = this.store.get(id.trim());
    if (!mail || mail.to.agentId !== agentId) throw new UserError(`no mail "${id}" in your mailbox`);
    return mail;
  }

  private async deliver(
    caller: Caller,
    targets: { address: string; registration: Registration | null; agent: AgentInfo }[],
    subject: string,
    body: string,
    thread?: { threadId: string; inReplyTo: string },
  ): Promise<Delivery[]> {
    const from = { agentId: caller.id, name: this.registry.get(caller.id)?.name ?? null, title: caller.title };
    const deliveries: Delivery[] = [];
    for (const target of targets) {
      const id = newId();
      await this.store.create({
        id,
        threadId: thread?.threadId ?? id,
        inReplyTo: thread?.inReplyTo ?? null,
        from,
        to: { agentId: target.agent.id, address: target.address },
        subject,
        body,
        createdAt: this.now(),
        readAt: null,
        nudgedAt: null,
        bouncedAt: null,
        seenAt: null,
      });
      deliveries.push({ address: target.address, agentId: target.agent.id, name: target.registration?.name ?? null, title: target.agent.title, mailId: id });
      this.schedule(target.agent.id);
    }
    return deliveries;
  }

  // ---------------------------------------------------------------- lifecycle

  /** After a (re)start: nudge agents holding mail they were not nudged about. */
  start(): void {
    for (const agentId of this.store.pendingNudges()) this.schedule(agentId);
  }

  onTurnStarted(agentId: string): void {
    this.inTurn.add(agentId);
    this.sentAt.delete(agentId);
  }

  onTurnEnded(agentId: string): void {
    this.inTurn.delete(agentId);
    this.sentAt.delete(agentId);
    this.schedule(agentId);
  }

  /** Releases the agent's name and roles and returns its unread mail to the senders. */
  async onArchived(agentId: string): Promise<void> {
    this.cancel(agentId);
    this.inTurn.delete(agentId);
    this.sentAt.delete(agentId);
    await this.registry.remove(agentId);
    const unread = this.store.unread(agentId).filter((mail) => mail.bouncedAt === null);
    if (unread.length === 0) return;
    const bouncedAt = this.now();
    await this.store.update(
      unread.map((mail) => mail.id),
      (mail) => {
        mail.bouncedAt = bouncedAt;
      },
    );
    for (const mail of unread) {
      if (mail.from.agentId === null || mail.from.agentId === agentId) continue;
      const sender = await this.live(mail.from.agentId);
      if (!sender) continue;
      const id = newId();
      await this.store.create({
        id,
        threadId: mail.threadId,
        inReplyTo: mail.id,
        from: { agentId: null, name: "paseo-mail", title: null },
        to: { agentId: sender.id, address: mail.from.name ?? sender.id },
        subject: `Returned: ${mail.subject}`,
        body: `Your mail to "${mail.to.address}" was not read: the recipient was archived.\n\n--- original mail ---\n${mail.body}`,
        createdAt: this.now(),
        readAt: null,
        nudgedAt: null,
        bouncedAt: null,
        seenAt: null,
      });
      this.schedule(sender.id);
    }
  }

  dispose(): Promise<void> {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    return Promise.all([this.store.close(), this.registry.close()]).then(() => undefined);
  }

  // ---------------------------------------------------------------- nudge

  private schedule(agentId: string, attempt = 0, delay = this.debounceMs): void {
    if (this.disposed) return;
    this.cancel(agentId);
    const timer = setTimeout(() => {
      this.timers.delete(agentId);
      void this.nudge(agentId, attempt).catch((error) => console.error(`[paseo-mail] nudge of ${agentId} failed:`, (error as Error).message));
    }, delay);
    (timer as { unref?: () => void }).unref?.();
    this.timers.set(agentId, timer);
  }

  private cancel(agentId: string): void {
    const timer = this.timers.get(agentId);
    if (timer) clearTimeout(timer);
    this.timers.delete(agentId);
  }

  private busy(agentId: string): boolean {
    if (this.inTurn.has(agentId)) return true;
    const sent = this.sentAt.get(agentId);
    if (sent === undefined) return false;
    if (Date.now() - sent < this.sendGraceMs) return true;
    // Our nudge never started a turn we saw: fall back to the agent's status.
    this.sentAt.delete(agentId);
    return false;
  }

  /** Sends a one-line nudge if the agent is idle and has unread mail it was not nudged about. */
  async nudge(agentId: string, attempt = 0): Promise<"sent" | "held" | "nothing"> {
    if (this.disposed || this.inFlight.has(agentId) || this.busy(agentId)) return "held";
    if (!this.store.unread(agentId).some((mail) => mail.nudgedAt === null && mail.bouncedAt === null)) return "nothing";
    this.inFlight.add(agentId);
    try {
      const agent = await this.paseo.agent(agentId).catch(() => null);
      if (!agent) return "nothing";
      if (agent.archived) {
        await this.onArchived(agentId);
        return "nothing";
      }
      if (agent.status !== "idle") {
        // A turn we saw starting will end with turn.after, which retries. Otherwise (a status
        // that lags the turn end, or a turn running since before the plugin started) retry a
        // few times, backing off.
        if (!this.inTurn.has(agentId) && attempt < this.maxRetries) this.schedule(agentId, attempt + 1, this.debounceMs * 2 ** (attempt + 1));
        return "held";
      }
      const unread = this.store.unread(agentId).filter((mail) => mail.bouncedAt === null);
      const stamped = unread.filter((mail) => mail.nudgedAt === null).map((mail) => mail.id);
      const nudgedAt = this.now();
      await this.store.update(stamped, (mail) => {
        mail.nudgedAt = nudgedAt;
      });
      this.sentAt.set(agentId, Date.now());
      try {
        // Steer only covers the gap between the status check and this send, in which a turn
        // may have started: a one-line note beats the default, which interrupts the turn.
        await this.paseo.send(agentId, nudgeText(unread.length));
      } catch (error) {
        this.sentAt.delete(agentId);
        await this.store.update(stamped, (mail) => {
          if (mail.nudgedAt === nudgedAt) mail.nudgedAt = null;
        });
        throw error;
      }
      return "sent";
    } finally {
      this.inFlight.delete(agentId);
    }
  }

  // ---------------------------------------------------------------- helpers

  /** The agent if it exists and is not archived; a dead registration is dropped. */
  private async live(agentId: string): Promise<AgentInfo | null> {
    const agent = await this.paseo.agent(agentId).catch(() => null);
    if (agent && !agent.archived) return agent;
    if (this.registry.get(agentId)) await this.registry.remove(agentId);
    return null;
  }

  private async projectOfCaller(caller: Caller): Promise<string | null> {
    const registered = this.registry.get(caller.id)?.projectId;
    if (registered) return registered;
    return caller.workspaceId ? this.paseo.projectOf(caller.workspaceId).catch(() => null) : null;
  }
}

export function describe(agent: AgentInfo): string {
  return agent.title ? `"${agent.title}"` : agent.id;
}
