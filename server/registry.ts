import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Queue, writeAtomic } from "./files";
import { RegistrationSchema, UserError, type Registration } from "./types";

const ADDRESS = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Lower-cases and trims a name or role, and refuses one that does not fit the pattern. */
export function normalize(value: string, kind: "name" | "role"): string {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS.test(normalized)) {
    throw new UserError(`invalid ${kind} "${value}": use 1-64 characters a-z, 0-9, ".", "_" or "-", starting with a letter or digit`);
  }
  return normalized;
}

/** Agent id → claimed name and roles, in one JSON file. */
export class Registry {
  private readonly entries = new Map<string, Registration>();
  private readonly queue = new Queue();
  private changes = 0;

  constructor(readonly file: string) {}

  /** Bumped on every change, like `MailStore.revision`. */
  get revision(): number {
    return this.changes;
  }

  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return;
    }
    try {
      for (const entry of z.array(RegistrationSchema).parse(JSON.parse(raw))) this.entries.set(entry.agentId, entry);
    } catch (error) {
      console.error(`[paseo-mail] ignoring unreadable registry ${this.file}:`, (error as Error).message);
    }
  }

  get(agentId: string): Registration | undefined {
    return this.entries.get(agentId);
  }

  list(): Registration[] {
    return [...this.entries.values()].sort((a, b) => (a.name ?? "~").localeCompare(b.name ?? "~") || a.agentId.localeCompare(b.agentId));
  }

  holderOf(name: string): Registration | undefined {
    return this.list().find((entry) => entry.name === name);
  }

  withRole(role: string): Registration[] {
    return this.list().filter((entry) => entry.roles.includes(role));
  }

  /** Stores an entry; one with no name and no roles is removed. */
  set(entry: Registration): Promise<void> {
    return this.queue.run(async () => {
      if (entry.name === null && entry.roles.length === 0) this.entries.delete(entry.agentId);
      else this.entries.set(entry.agentId, entry);
      this.changes += 1;
      await this.save();
    });
  }

  remove(agentId: string): Promise<boolean> {
    return this.queue.run(async () => {
      if (!this.entries.delete(agentId)) return false;
      this.changes += 1;
      await this.save();
      return true;
    });
  }

  close(): Promise<void> {
    return this.queue.idle();
  }

  private save(): Promise<void> {
    return writeAtomic(this.file, `${JSON.stringify([...this.entries.values()], null, 2)}\n`);
  }
}
