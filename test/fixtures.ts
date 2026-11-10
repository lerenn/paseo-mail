import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Mailer, type MailerOptions } from "../server/mailer";
import { Registry } from "../server/registry";
import { MailStore } from "../server/store";
import type { AgentInfo, Caller, PaseoPort } from "../server/types";

/** An in-memory daemon: agents with a status, workspaces with a project, recorded sends. */
export class FakePaseo implements PaseoPort {
  readonly agents = new Map<string, AgentInfo>();
  readonly projects = new Map<string, string>();
  readonly sent: { agentId: string; text: string }[] = [];
  failSends = false;

  add(id: string, options: { title?: string; workspaceId?: string; status?: string } = {}): Caller {
    this.agents.set(id, { id, title: options.title ?? null, workspaceId: options.workspaceId ?? null, status: options.status ?? "idle", archived: false });
    return { id, workspaceId: options.workspaceId ?? null, title: options.title ?? null };
  }

  archive(id: string): void {
    this.agents.get(id)!.archived = true;
  }

  status(id: string, status: string): void {
    this.agents.get(id)!.status = status;
  }

  async agent(id: string) {
    const agent = this.agents.get(id);
    return agent ? { ...agent } : null;
  }

  async projectOf(workspaceId: string) {
    return this.projects.get(workspaceId) ?? null;
  }

  async send(agentId: string, text: string) {
    if (this.failSends) throw new Error("send failed");
    this.sent.push({ agentId, text });
  }
}

export async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "paseo-mail-"));
}

export async function setup(options: MailerOptions = {}, dir?: string) {
  const root = dir ?? (await tempDir());
  const store = new MailStore(path.join(root, "mail"));
  const registry = new Registry(path.join(root, "registry.json"));
  await Promise.all([store.init(), registry.init()]);
  const paseo = new FakePaseo();
  const mailer = new Mailer(store, registry, paseo, { debounceMs: 5, maxRetries: 0, ...options });
  return { root, store, registry, paseo, mailer };
}
