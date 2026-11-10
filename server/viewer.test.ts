import { afterEach, describe, expect, it } from "vitest";
import { listMailboxesRpc, listMailsRpc, markSeenRpc, viewMailRpc } from "../shared/contracts";
import { setup } from "../test/fixtures";
import type { Mailer } from "./mailer";
import { MailStore } from "./store";
import { MailViewer } from "./viewer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

let current: Mailer | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

async function world() {
  const env = await setup({ debounceMs: 60_000 });
  current = env.mailer;
  const alice = env.paseo.add("alice-id", { title: "Alice", workspaceId: "w1" });
  const bob = env.paseo.add("bob-id", { title: "Bob", workspaceId: "w1" });
  await env.mailer.register(alice, { name: "alice", roles: ["lead"] });
  await env.mailer.register(bob, { name: "bob" });
  const viewer = new MailViewer(env.store, env.registry, env.paseo, () => "2026-11-10T12:00:00.000Z");
  return { ...env, alice, bob, viewer };
}

describe("mailboxes", () => {
  it("lists registered agents, empty ones included, with agent-unread and human-unseen counts", async () => {
    const { mailer, viewer, alice } = await world();
    await mailer.send(alice, ["bob"], "One", "1");
    const [second] = await mailer.send(alice, ["bob"], "Two", "2");
    await mailer.read("bob-id", second!.mailId);
    const boxes = listMailboxesRpc.output.parse({ revision: viewer.revision(), mailboxes: await viewer.mailboxes() }).mailboxes;
    expect(boxes.map((box) => box.name)).toEqual(["alice", "bob"]);
    expect(boxes[0]).toMatchObject({ agentId: "alice-id", title: "Alice", roles: ["lead"], archived: false, total: 0, unread: 0, lastMailAt: null });
    expect(boxes[1]).toMatchObject({ agentId: "bob-id", total: 2, unread: 1, unseen: 2, bounced: 0, archived: false });
  });

  it("keeps an archived agent's mailbox, last, under its last name, with its returned mail", async () => {
    const { mailer, viewer, paseo, alice, bob } = await world();
    await mailer.send(bob, ["alice"], "From bob", "x");
    await mailer.send(alice, ["bob"], "Never read", "y");
    paseo.archive("bob-id");
    await mailer.onArchived("bob-id");
    const boxes = await viewer.mailboxes();
    expect(boxes.map((box) => [box.name, box.archived])).toEqual([
      ["alice", false],
      ["bob", true],
    ]);
    expect(boxes[1]).toMatchObject({ roles: [], unread: 0, bounced: 1, total: 1 });
    // The bounce reached alice, from paseo-mail itself.
    expect(boxes[0]).toMatchObject({ total: 1 + 1, unread: 2 });
  });

  it("asks the daemon about an archived agent only once", async () => {
    const { mailer, viewer, paseo, alice } = await world();
    await mailer.send(alice, ["bob"], "s", "b");
    paseo.archive("bob-id");
    let calls = 0;
    const agent = paseo.agent.bind(paseo);
    paseo.agent = async (id: string) => {
      if (id === "bob-id") calls += 1;
      return agent(id);
    };
    await viewer.mailboxes();
    await viewer.mailboxes();
    expect(calls).toBe(1);
  });

  it("moves the revision on mail and registry changes only", async () => {
    const { mailer, viewer, alice } = await world();
    const before = viewer.revision();
    expect(viewer.revision()).toBe(before);
    await mailer.send(alice, ["bob"], "s", "b");
    const afterSend = viewer.revision();
    expect(afterSend).not.toBe(before);
    await mailer.register(alice, { roles: [] });
    expect(viewer.revision()).not.toBe(afterSend);
  });
});

describe("mails", () => {
  it("lists a mailbox newest first, without bodies, with a one-line preview", async () => {
    const { mailer, viewer, alice } = await world();
    await mailer.send(alice, ["bob"], "Old", "first\n\nline");
    await mailer.send(alice, ["bob"], "New", "x".repeat(500));
    const result = listMailsRpc.output.parse(viewer.list("bob-id"));
    expect(result.total).toBe(2);
    expect(result.mails.map((mail) => mail.subject)).toEqual(["New", "Old"]);
    expect(result.mails[1]!.preview).toBe("first line");
    expect(result.mails[0]!.preview).toHaveLength(140);
    expect(result.mails[0]).not.toHaveProperty("body");
    expect(viewer.list("bob-id", 1)).toMatchObject({ total: 2, mails: [{ subject: "New" }] });
    expect(viewer.list("nobody")).toEqual({ mails: [], total: 0 });
  });

  it("views a mail with its whole thread, oldest first, across mailboxes, and marks nothing", async () => {
    const { mailer, viewer, alice, bob } = await world();
    const [first] = await mailer.send(alice, ["bob"], "Question", "why?");
    await mailer.read("bob-id", first!.mailId);
    const reply = await mailer.reply(bob, first!.mailId, "because");
    await mailer.send(alice, ["bob"], "Other", "unrelated");
    const result = viewMailRpc.output.parse(viewer.view(reply.mailId));
    expect(result.mail).toMatchObject({ subject: "Re: Question", body: "because", readAt: null, seenAt: null });
    expect(result.thread.map((mail) => [mail.to.agentId, mail.body])).toEqual([
      ["bob-id", "why?"],
      ["alice-id", "because"],
    ]);
    expect(mailer.unreadCount("alice-id")).toBe(1);
    expect(() => viewer.view("m_missing")).toThrow(/no mail/);
  });

  it("marks a mail seen and unseen without the agent having read it", async () => {
    const { mailer, viewer, alice } = await world();
    const [delivery] = await mailer.send(alice, ["bob"], "s", "b");
    const seenAt = markSeenRpc.output.parse({ seenAt: await viewer.setSeen(delivery!.mailId, true) }).seenAt;
    expect(seenAt).toBe("2026-11-10T12:00:00.000Z");
    expect(mailer.unreadCount("bob-id")).toBe(1);
    expect(mailer.list("bob-id", { unreadOnly: true })).toHaveLength(1);
    const [box] = (await viewer.mailboxes()).filter((b) => b.agentId === "bob-id");
    expect(box).toMatchObject({ unread: 1, unseen: 0 });
    // Still nudged about: being seen by a human is not being read.
    expect(mailer.list("bob-id")[0]).toMatchObject({ readAt: null, nudgedAt: null });
    expect(await viewer.setSeen(delivery!.mailId, false)).toBeNull();
    await expect(viewer.setSeen("m_missing", true)).rejects.toThrow(/no mail/);
  });

  it("validates the RPC inputs", () => {
    expect(listMailsRpc.input.parse({ agentId: "a" })).toEqual({ agentId: "a", limit: 200 });
    expect(() => listMailsRpc.input.parse({ agentId: "" })).toThrow();
    expect(() => listMailsRpc.input.parse({ agentId: "a", limit: 5000 })).toThrow();
    expect(() => viewMailRpc.input.parse({})).toThrow();
    expect(() => markSeenRpc.input.parse({ id: "m", seen: "yes" })).toThrow();
  });
});

describe("store", () => {
  it("reads mail written before seenAt existed", async () => {
    const { root } = await world();
    const dir = path.join(root, "old");
    await mkdir(dir, { recursive: true });
    const old = {
      id: "m_old",
      threadId: "m_old",
      inReplyTo: null,
      from: { agentId: "a", name: "a", title: null },
      to: { agentId: "b", address: "b" },
      subject: "s",
      body: "b",
      createdAt: "2026-11-01T00:00:00.000Z",
      readAt: null,
      nudgedAt: null,
      bouncedAt: null,
    };
    await writeFile(path.join(dir, "m_old.json"), JSON.stringify(old));
    const store = new MailStore(dir);
    await store.init();
    expect(store.get("m_old")).toMatchObject({ seenAt: null });
  });
});
