import type { PluginServerContext } from "@getpaseo/plugin/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import contribute from "./index.server";
import { tempDir } from "./test/fixtures";

type Handler = (payload: unknown, context: unknown) => Promise<unknown>;

/** A daemon API with two idle agents, recording the messages sent to them. */
function fakeApi(sent: { id: string; text: string }[]) {
  const agent = (id: string) => ({ id, title: id.toUpperCase(), workspaceId: "w1", status: "idle", archivedAt: null });
  return {
    agents: {
      ref: (id: string) => ({
        refresh: async () => ({ agent: agent(id), project: null }),
        send: async (text: string) => {
          sent.push({ id, text });
        },
      }),
    },
    workspaces: { ref: () => ({ refresh: async () => ({ projectId: "p1" }) }) },
  };
}

describe("contribute", () => {
  let previousHome: string | undefined;
  beforeEach(async () => {
    previousHome = process.env.PASEO_HOME;
    process.env.PASEO_HOME = await tempDir();
  });
  afterEach(() => {
    if (previousHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previousHome;
  });

  it("adds the mail tools to interactive sessions and nudges after a turn", async () => {
    const hooks = new Map<string, Handler>();
    const server = { addHook: (name: string, handler: Handler) => (hooks.set(name, handler), () => hooks.delete(name)) } as unknown as PluginServerContext;
    const cleanup = contribute(server) as () => Promise<void>;
    expect([...hooks.keys()].sort()).toEqual(["agent.archive.after", "agent.open.before", "agent.turn.after", "agent.turn.before"]);

    const sent: { id: string; text: string }[] = [];
    const context = { paseo: fakeApi(sent), signal: new AbortController().signal };
    const request = { agentId: "a", workspaceId: "w1", provider: "claude", cwd: "/tmp", reason: "create", purpose: "interactive", title: null, labels: {}, tools: [], env: {}, mcpServers: {} };
    expect(await hooks.get("agent.open.before")!({ request: { ...request, purpose: "history" } }, context)).toBeUndefined();
    const opened = (await hooks.get("agent.open.before")!({ request }, context)) as { tools: { name: string; execute: (input: unknown, context: unknown) => Promise<{ text: string }> }[] };
    const tool = (name: string) => opened.tools.find((t) => t.name === name)!;
    expect(opened.tools.map((t) => t.name)).toContain("mail_send");

    const toolContext = (id: string) => ({ ...context, agent: { id, workspaceId: "w1", parentAgentId: null, provider: "claude", cwd: "/tmp", title: id.toUpperCase() } });
    await tool("mail_register").execute({ name: "bob" }, toolContext("b"));
    await hooks.get("agent.turn.before")!({ agent: { id: "b" }, turnId: null }, context);
    expect((await tool("mail_send").execute({ to: "bob", subject: "Hi", body: "x" }, toolContext("a"))).text).toContain("→ bob");
    await hooks.get("agent.turn.after")!({ agent: { id: "b" }, turnId: null, outcome: { kind: "completed" }, timeline: [] }, context);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(sent).toEqual([{ id: "b", text: "[paseo-mail] You have 1 unread mail. Call mail_list to see them." }]);
    await cleanup();
  });
});
