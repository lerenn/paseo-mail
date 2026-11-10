import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Queue, writeAtomic } from "./files";
import { MailSchema, type Mail } from "./types";

/** One JSON file per mail, with an in-memory index. Writes are serialized. */
export class MailStore {
  private readonly mails = new Map<string, Mail>();
  private readonly queue = new Queue();
  /** Bumped on every change, so a viewer can poll cheaply for "anything new?". */
  private changes = 0;

  constructor(readonly dir: string) {}

  get revision(): number {
    return this.changes;
  }

  /** Every mail, in no particular order. */
  all(): Mail[] {
    return [...this.mails.values()];
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const mail = MailSchema.parse(JSON.parse(await readFile(path.join(this.dir, name), "utf8")));
        this.mails.set(mail.id, mail);
      } catch (error) {
        console.error(`[paseo-mail] skipping unreadable mail file ${name}:`, (error as Error).message);
      }
    }
  }

  get(id: string): Mail | undefined {
    return this.mails.get(id);
  }

  /** Mail to an agent, newest first. */
  inbox(agentId: string): Mail[] {
    return [...this.mails.values()].filter((mail) => mail.to.agentId === agentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  unread(agentId: string): Mail[] {
    return this.inbox(agentId).filter((mail) => mail.readAt === null);
  }

  /** Agents with unread mail they have not been nudged about. */
  pendingNudges(): string[] {
    return [...new Set([...this.mails.values()].filter((mail) => mail.readAt === null && mail.nudgedAt === null && mail.bouncedAt === null).map((mail) => mail.to.agentId))];
  }

  create(mail: Mail): Promise<Mail> {
    return this.queue.run(async () => {
      if (this.mails.has(mail.id)) throw new Error(`mail ${mail.id} already exists`);
      await this.write(mail);
      this.mails.set(mail.id, mail);
      this.changes += 1;
      return mail;
    });
  }

  /** Applies a change to several mails and persists them. Returns the updated mails. */
  update(ids: string[], change: (mail: Mail) => void): Promise<Mail[]> {
    return this.queue.run(async () => {
      const updated: Mail[] = [];
      for (const id of ids) {
        const current = this.mails.get(id);
        if (!current) continue;
        const next = structuredClone(current);
        change(next);
        await this.write(next);
        this.mails.set(id, next);
        updated.push(next);
      }
      if (updated.length > 0) this.changes += 1;
      return updated;
    });
  }

  close(): Promise<void> {
    return this.queue.idle();
  }

  private write(mail: Mail): Promise<void> {
    return writeAtomic(path.join(this.dir, `${mail.id}.json`), `${JSON.stringify(mail, null, 2)}\n`);
  }
}
