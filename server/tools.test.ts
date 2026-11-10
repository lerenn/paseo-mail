import type { AgentToolContext } from "@getpaseo/plugin/server";
import { afterEach, describe, expect, it } from "vitest";
import { setup } from "../test/fixtures";
import type { Mailer } from "./mailer";
import { mailTools, TOOL_NAMES } from "./tools";

let current: Mailer | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

function context(id: string, title: string | null = null): AgentToolContext {
  return {
    agent: { id, workspaceId: "w1", parentAgentId: null, provider: "claude", cwd: "/tmp", title },
    paseo: {} as AgentToolContext["paseo"],
    signal: new AbortController().signal,
  };
}

async function tools() {
  const env = await setup({ debounceMs: 60_000 });
  current = env.mailer;
  env.paseo.add("a", { title: "Alice", workspaceId: "w1" });
  env.paseo.add("b", { title: "Bob", workspaceId: "w1" });
  const byName = Object.fromEntries(mailTools(env.mailer).map((tool) => [tool.name, tool]));
  const call = (name: string, input: unknown, agent: string) => byName[name]!.execute(byName[name]!.input.parse(input), context(agent, env.paseo.agents.get(agent)?.title ?? null));
  return { ...env, byName, call };
}

describe("tools", () => {
  it("exposes the documented names", async () => {
    const { byName } = await tools();
    expect(Object.keys(byName)).toEqual(TOOL_NAMES);
  });

  it("runs a full exchange, with the unread count on every result", async () => {
    const { call } = await tools();
    expect((await call("mail_register", { name: "alice" }, "a")).text).toContain("Name: alice");
    await call("mail_register", { name: "bob", roles: ["qa"] }, "b");
    expect((await call("mail_directory", {}, "a")).text).toContain('bob roles: qa — "Bob"');
    const sent = await call("mail_send", { to: "role:qa", subject: "Review", body: "Please" }, "a");
    expect(sent.isError).toBeUndefined();
    expect(sent.text).toMatch(/Sent 1 mail:\n- m_\w+ → bob \(via role:qa\)\n\nUnread: 0$/);
    const listed = await call("mail_list", { unread_only: true }, "b");
    expect(listed.text).toContain("from alice: Review");
    expect(listed.text!.endsWith("Unread: 1")).toBe(true);
    const id = (listed.structuredContent as { mails: { id: string }[] }).mails[0]!.id;
    const read = await call("mail_read", { id }, "b");
    expect(read.text).toContain("Please");
    expect(read.text!.endsWith("Unread: 0")).toBe(true);
    expect((await call("mail_reply", { id, body: "Done" }, "b")).text).toContain("→ alice");
    expect((await call("mail_list", {}, "a")).text).toContain("Re: Review");
  });

  it("returns refusals as tool errors", async () => {
    const { call } = await tools();
    const result = await call("mail_send", { to: "nobody", subject: "s", body: "b" }, "a");
    expect(result.isError).toBe(true);
    expect(result.text).toContain('no live agent is registered as "nobody"');
  });

  it("names unregistered senders by title", async () => {
    const { call } = await tools();
    await call("mail_register", { name: "bob" }, "b");
    await call("mail_send", { to: "bob", subject: "Hi", body: "x" }, "a");
    expect((await call("mail_list", {}, "b")).text).toContain('from "Alice" (unregistered): Hi');
  });
});
