import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { PaseoPort } from "./types";

/** The daemon API handed to hooks and tools (typed via the SDK). */
export type PaseoApi = PluginHandlerContext["paseo"];

/** Adapts the daemon API to the mailer's port. The API is attached by the first hook or tool. */
export class PaseoAdapter implements PaseoPort {
  private api: PaseoApi | null = null;

  attach(api: PaseoApi): boolean {
    if (this.api) return false;
    this.api = api;
    return true;
  }

  private paseo(): PaseoApi {
    if (!this.api) throw new Error("Paseo API not attached yet");
    return this.api;
  }

  async agent(id: string) {
    const result = await this.paseo().agents.ref(id).refresh();
    if (!result) return null;
    const { agent } = result;
    return { id: agent.id, title: agent.title, workspaceId: agent.workspaceId ?? null, status: agent.status, archived: Boolean(agent.archivedAt) };
  }

  async projectOf(workspaceId: string) {
    const workspace = await this.paseo().workspaces.ref(workspaceId).refresh();
    return workspace?.projectId ?? null;
  }

  send(agentId: string, text: string) {
    return this.paseo().agents.ref(agentId).send(text, { activeTurnBehavior: "steer" });
  }
}
