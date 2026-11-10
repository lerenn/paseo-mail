import { afterEach, describe, expect, it } from "vitest";
import { setup } from "../test/fixtures";
import { nudgeText, type Mailer } from "./mailer";

let current: Mailer | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

async function pair() {
  const env = await setup({ debounceMs: 60_000 });
  current = env.mailer;
  const alice = env.paseo.add("alice-id", { title: "Alice", workspaceId: "w1" });
  const bob = env.paseo.add("bob-id", { title: "Bob", workspaceId: "w1" });
  await env.mailer.register(alice, { name: "alice" });
  await env.mailer.register(bob, { name: "bob" });
  return { ...env, alice, bob };
}

describe("send, list, read", () => {
  it("delivers by name and marks read on read", async () => {
    const { mailer, alice, bob } = await pair();
    const [delivery] = await mailer.send(alice, ["Bob"], "Hello", "Body text");
    expect(delivery).toMatchObject({ agentId: "bob-id", name: "bob", address: "Bob" });
    expect(mailer.unreadCount("bob-id")).toBe(1);
    const [listed] = mailer.list("bob-id", { unreadOnly: true });
    expect(listed).toMatchObject({ subject: "Hello", from: { agentId: "alice-id", name: "alice" } });
    const mail = await mailer.read("bob-id", delivery!.mailId);
    expect(mail.body).toBe("Body text");
    expect(mail.readAt).not.toBeNull();
    expect(mailer.unreadCount("bob-id")).toBe(0);
    expect(mailer.list("bob-id")).toHaveLength(1);
    await expect(mailer.read("alice-id", delivery!.mailId)).rejects.toThrow(/no mail/);
    void bob;
  });

  it("fails on an unknown address and sends nothing", async () => {
    const { mailer, alice } = await pair();
    await expect(mailer.send(alice, ["bob", "nobody"], "s", "b")).rejects.toThrow(/no live agent is registered as "nobody"/);
    await expect(mailer.send(alice, ["role:qa"], "s", "b")).rejects.toThrow(/role "qa"/);
    expect(mailer.unreadCount("bob-id")).toBe(0);
  });

  it("fails for an archived recipient", async () => {
    const { mailer, paseo, alice } = await pair();
    paseo.archive("bob-id");
    await expect(mailer.send(alice, ["bob"], "s", "b")).rejects.toThrow(/no live agent/);
  });

  it("refuses mail to yourself", async () => {
    const { mailer, alice } = await pair();
    await expect(mailer.send(alice, ["alice"], "s", "b")).rejects.toThrow(/yourself/);
  });

  it("gives one copy per agent when addresses overlap", async () => {
    const { mailer, alice, bob } = await pair();
    await mailer.register(bob, { roles: ["qa"] });
    const deliveries = await mailer.send(alice, ["bob", "role:qa"], "s", "b");
    expect(deliveries).toHaveLength(1);
  });
});

describe("roles", () => {
  it("reaches holders in the sender's workspace, else project, else anywhere", async () => {
    const env = await setup({ debounceMs: 60_000 });
    current = env.mailer;
    const { paseo, mailer } = env;
    paseo.projects.set("w1", "p1");
    paseo.projects.set("w2", "p1");
    paseo.projects.set("w3", "p2");
    const sender = paseo.add("s", { workspaceId: "w1" });
    const sameProject = paseo.add("q2", { workspaceId: "w2" });
    const elsewhere = paseo.add("q3", { workspaceId: "w3" });
    await mailer.register(sameProject, { roles: ["qa"] });
    await mailer.register(elsewhere, { roles: ["qa"] });
    expect((await mailer.resolve(sender, "role:qa")).map((t) => t.agentId)).toEqual(["q2"]);
    const sameWorkspace = paseo.add("q1", { workspaceId: "w1" });
    await mailer.register(sameWorkspace, { roles: ["qa"] });
    expect((await mailer.resolve(sender, "role:QA")).map((t) => t.agentId)).toEqual(["q1"]);
    const outsider = paseo.add("o", { workspaceId: "w9" });
    expect((await mailer.resolve(outsider, "role:qa")).map((t) => t.agentId).sort()).toEqual(["q1", "q2", "q3"]);
  });
});

describe("reply", () => {
  it("goes to the sender in the same thread", async () => {
    const { mailer, alice, bob } = await pair();
    const [first] = await mailer.send(alice, ["bob"], "Question", "?");
    const reply = await mailer.reply(bob, first!.mailId, "Answer");
    expect(reply.agentId).toBe("alice-id");
    const [mail] = mailer.list("alice-id");
    expect(mail).toMatchObject({ subject: "Re: Question", threadId: first!.mailId, inReplyTo: first!.mailId });
    const again = await mailer.reply(alice, mail!.id, "Thanks");
    expect(mailer.list("bob-id")[0]?.subject).toBe("Re: Question");
    expect(again.agentId).toBe("bob-id");
  });

  it("follows the sender's name when the sender was archived", async () => {
    const { mailer, paseo, alice, bob } = await pair();
    const [first] = await mailer.send(alice, ["bob"], "Q", "?");
    paseo.archive("alice-id");
    await mailer.onArchived("alice-id");
    await expect(mailer.reply(bob, first!.mailId, "A")).rejects.toThrow(/no live agent is registered as "alice"/);
    const alice2 = paseo.add("alice2-id");
    await mailer.register(alice2, { name: "alice" });
    expect((await mailer.reply(bob, first!.mailId, "A")).agentId).toBe("alice2-id");
  });

  it("errors when an archived sender had no name", async () => {
    const { mailer, paseo, bob } = await pair();
    const anon = paseo.add("anon");
    const [first] = await mailer.send(anon, ["bob"], "Q", "?");
    paseo.archive("anon");
    await expect(mailer.reply(bob, first!.mailId, "A")).rejects.toThrow(/no registered name/);
  });
});

describe("archived recipients", () => {
  it("returns unread mail to the sender", async () => {
    const { mailer, paseo, alice } = await pair();
    const [read] = await mailer.send(alice, ["bob"], "Read one", "x");
    await mailer.send(alice, ["bob"], "Unread one", "y");
    await mailer.read("bob-id", read!.mailId);
    paseo.archive("bob-id");
    await mailer.onArchived("bob-id");
    const inbox = mailer.list("alice-id");
    expect(inbox.map((m) => m.subject)).toEqual(["Returned: Unread one"]);
    expect(inbox[0]!.from).toMatchObject({ agentId: null, name: "paseo-mail" });
    expect(inbox[0]!.body).toContain('was not read: the recipient was archived');
    await expect(mailer.reply(alice, inbox[0]!.id, "?")).rejects.toThrow(/paseo-mail itself/);
    await mailer.onArchived("bob-id");
    expect(mailer.list("alice-id")).toHaveLength(1);
  });
});

describe("idle nudge", () => {
  it("nudges an idle agent once, with the unread count", async () => {
    const { mailer, paseo, alice } = await pair();
    await mailer.send(alice, ["bob"], "One", "1");
    await mailer.send(alice, ["bob"], "Two", "2");
    expect(await mailer.nudge("bob-id")).toBe("sent");
    expect(paseo.sent).toEqual([{ agentId: "bob-id", text: nudgeText(2) }]);
    mailer.onTurnStarted("bob-id");
    mailer.onTurnEnded("bob-id");
    expect(await mailer.nudge("bob-id")).toBe("nothing");
    expect(paseo.sent).toHaveLength(1);
  });

  it("does not wake an agent for mail it has read", async () => {
    const { mailer, paseo, alice } = await pair();
    const [d] = await mailer.send(alice, ["bob"], "One", "1");
    await mailer.read("bob-id", d!.mailId);
    expect(await mailer.nudge("bob-id")).toBe("nothing");
    expect(paseo.sent).toEqual([]);
  });

  it("nudges again only for new mail", async () => {
    const { mailer, paseo, alice } = await pair();
    await mailer.send(alice, ["bob"], "One", "1");
    await mailer.nudge("bob-id");
    mailer.onTurnStarted("bob-id");
    mailer.onTurnEnded("bob-id");
    await mailer.send(alice, ["bob"], "Two", "2");
    expect(await mailer.nudge("bob-id")).toBe("sent");
    expect(paseo.sent.map((s) => s.text)).toEqual([nudgeText(1), nudgeText(2)]);
  });

  it("holds while the agent is in a turn and sends when it ends", async () => {
    const env = await setup({ debounceMs: 5 });
    current = env.mailer;
    const { mailer, paseo } = env;
    const alice = paseo.add("a");
    const bob = paseo.add("b", { status: "running" });
    await mailer.register(bob, { name: "bob" });
    mailer.onTurnStarted("b");
    await mailer.send(alice, ["bob"], "s", "b");
    await wait();
    expect(paseo.sent).toEqual([]);
    paseo.status("b", "idle");
    mailer.onTurnEnded("b");
    await wait();
    expect(paseo.sent).toEqual([{ agentId: "b", text: nudgeText(1) }]);
  });

  it("holds an agent whose status is running and retries", async () => {
    const env = await setup({ debounceMs: 5, maxRetries: 3 });
    current = env.mailer;
    const { mailer, paseo } = env;
    const alice = paseo.add("a");
    const bob = paseo.add("b", { status: "running" });
    await mailer.register(bob, { name: "bob" });
    await mailer.send(alice, ["bob"], "s", "b");
    await wait(15);
    expect(paseo.sent).toEqual([]);
    paseo.status("b", "idle");
    await wait(80);
    expect(paseo.sent).toHaveLength(1);
  });

  it("counts its own nudge as busy until the turn ends", async () => {
    const { mailer, paseo, alice } = await pair();
    await mailer.send(alice, ["bob"], "One", "1");
    await mailer.nudge("bob-id");
    await mailer.send(alice, ["bob"], "Two", "2");
    expect(await mailer.nudge("bob-id")).toBe("held");
    expect(paseo.sent).toHaveLength(1);
  });

  it("forgets its own nudge as busy after the grace period", async () => {
    const env = await setup({ debounceMs: 60_000, sendGraceMs: 0 });
    current = env.mailer;
    const { mailer, paseo } = env;
    const alice = paseo.add("a");
    await mailer.register(paseo.add("b"), { name: "bob" });
    await mailer.send(alice, ["bob"], "One", "1");
    await mailer.nudge("b");
    await mailer.send(alice, ["bob"], "Two", "2");
    expect(await mailer.nudge("b")).toBe("sent");
  });

  it("clears its stamps when the send fails, so it retries", async () => {
    const { mailer, paseo, alice } = await pair();
    await mailer.send(alice, ["bob"], "One", "1");
    paseo.failSends = true;
    await expect(mailer.nudge("bob-id")).rejects.toThrow(/send failed/);
    paseo.failSends = false;
    expect(await mailer.nudge("bob-id")).toBe("sent");
  });

  it("debounces a burst into one nudge", async () => {
    const env = await setup({ debounceMs: 10 });
    current = env.mailer;
    const { mailer, paseo } = env;
    const alice = paseo.add("a");
    await mailer.register(paseo.add("b"), { name: "bob" });
    for (let i = 0; i < 3; i++) await mailer.send(alice, ["bob"], `m${i}`, "x");
    await wait(60);
    expect(paseo.sent).toEqual([{ agentId: "b", text: nudgeText(3) }]);
  });

  it("nudges held mail after a restart", async () => {
    const first = await setup({ debounceMs: 60_000 });
    const alice = first.paseo.add("a");
    await first.mailer.register(first.paseo.add("b"), { name: "bob" });
    await first.mailer.send(alice, ["bob"], "s", "b");
    await first.mailer.dispose();
    const second = await setup({ debounceMs: 5 }, first.root);
    current = second.mailer;
    second.paseo.add("b");
    expect(second.mailer.unreadCount("b")).toBe(1);
    second.mailer.start();
    await wait();
    expect(second.paseo.sent).toEqual([{ agentId: "b", text: nudgeText(1) }]);
  });
});
