import { randomBytes } from "node:crypto";
import type { FullMail, Mailbox, MailHeader } from "../shared/contracts";
import type { Registry } from "./registry";
import type { MailStore } from "./store";
import { UserError, type AgentInfo, type Mail, type PaseoPort } from "./types";

const PREVIEW_LENGTH = 140;

export function header(mail: Mail): MailHeader {
  const { body, ...rest } = mail;
  const preview = body.replace(/\s+/g, " ").trim();
  return { ...rest, preview: preview.length > PREVIEW_LENGTH ? `${preview.slice(0, PREVIEW_LENGTH - 1)}…` : preview };
}

function full(mail: Mail): FullMail {
  return { ...header(mail), body: mail.body };
}

const newestFirst = (a: Mail, b: Mail) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/**
 * What the Mail screen shows: the mailboxes, their mail and threads, read-only. A human can only
 * mark a mail seen (`seenAt`); `readAt` stays the recipient agent's (docs/adrs/2026-11-10-mail-screen.md).
 */
export class MailViewer {
  /** Archived or missing agents: that never changes back, so they are asked about once. */
  private readonly gone = new Map<string, AgentInfo | null>();
  private readonly boot = randomBytes(4).toString("hex");

  constructor(
    private readonly store: MailStore,
    private readonly registry: Registry,
    private readonly paseo: PaseoPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Moves on every mail or registry change (and on a daemon restart). */
  revision(): string {
    return `${this.boot}.${this.store.revision}.${this.registry.revision}`;
  }

  async mailboxes(): Promise<Mailbox[]> {
    const mails = this.store.all();
    const received = new Map<string, Mail[]>();
    const sent = new Map<string, Mail[]>();
    for (const mail of mails) {
      received.set(mail.to.agentId, [...(received.get(mail.to.agentId) ?? []), mail]);
      if (mail.from.agentId) sent.set(mail.from.agentId, [...(sent.get(mail.from.agentId) ?? []), mail]);
    }
    const ids = new Set([...this.registry.list().map((entry) => entry.agentId), ...received.keys()]);
    const boxes = await Promise.all(
      [...ids].map(async (agentId): Promise<Mailbox> => {
        const registration = this.registry.get(agentId);
        const inbox = (received.get(agentId) ?? []).sort(newestFirst);
        const outbox = (sent.get(agentId) ?? []).sort(newestFirst);
        const agent = await this.agent(agentId);
        // A registered name wins; an archived agent has lost it, so take the last one it used.
        const name =
          registration?.name ??
          outbox.find((mail) => mail.from.name)?.from.name ??
          inbox.find((mail) => !/^(role|agent):/i.test(mail.to.address))?.to.address.toLowerCase() ??
          null;
        return {
          agentId,
          name,
          title: agent?.title ?? outbox.find((mail) => mail.from.title)?.from.title ?? null,
          roles: registration?.roles ?? [],
          workspaceId: registration?.workspaceId ?? agent?.workspaceId ?? null,
          archived: !agent || agent.archived,
          unread: inbox.filter((mail) => mail.readAt === null && mail.bouncedAt === null).length,
          unseen: inbox.filter((mail) => mail.seenAt === null).length,
          bounced: inbox.filter((mail) => mail.bouncedAt !== null).length,
          total: inbox.length,
          lastMailAt: inbox[0]?.createdAt ?? null,
        };
      }),
    );
    const label = (box: Mailbox) => (box.name ?? box.title ?? box.agentId).toLowerCase();
    return boxes.sort((a, b) => Number(a.archived) - Number(b.archived) || label(a).localeCompare(label(b)) || a.agentId.localeCompare(b.agentId));
  }

  list(agentId: string, limit = 200): { mails: MailHeader[]; total: number } {
    const inbox = this.store.inbox(agentId);
    return { mails: inbox.slice(0, limit).map(header), total: inbox.length };
  }

  view(id: string): { mail: FullMail; thread: FullMail[] } {
    const mail = this.store.get(id.trim());
    if (!mail) throw new UserError(`no mail "${id}"`);
    const thread = this.store
      .all()
      .filter((other) => other.threadId === mail.threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { mail: full(mail), thread: thread.map(full) };
  }

  /** Sets or clears `seenAt` only; whether the agent has read the mail is left alone. */
  async setSeen(id: string, seen: boolean): Promise<string | null> {
    const mail = this.store.get(id.trim());
    if (!mail) throw new UserError(`no mail "${id}"`);
    if ((mail.seenAt !== null) === seen) return mail.seenAt;
    const seenAt = seen ? this.now() : null;
    const [updated] = await this.store.update([mail.id], (current) => {
      current.seenAt = seenAt;
    });
    return updated?.seenAt ?? seenAt;
  }

  private async agent(agentId: string): Promise<AgentInfo | null> {
    if (this.gone.has(agentId)) return this.gone.get(agentId)!;
    let agent: AgentInfo | null;
    try {
      agent = await this.paseo.agent(agentId);
    } catch {
      // The daemon could not answer: say live for now and ask again next time.
      return { id: agentId, title: null, workspaceId: null, status: "unknown", archived: false };
    }
    if (!agent || agent.archived) this.gone.set(agentId, agent);
    return agent;
  }
}
