import { afterEach, describe, expect, it } from "vitest";
import { setup } from "../test/fixtures";
import type { Mailer } from "./mailer";
import { isSidekick, sidekickMailName, sidekickPrompt } from "./sidekick";
import { MAIL_NOTE } from "./system-prompt";

let current: Mailer | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

describe("sidekick mailbox name", () => {
  it("is <project-name>-sidekick, from the agent title", () => {
    expect(sidekickMailName("Playbooks Sidekick · Anyshift Monorepo", "p1")).toBe("anyshift-monorepo-sidekick");
    expect(sidekickMailName("Playbooks Sidekick · my_repo.v2", null)).toBe("my-repo-v2-sidekick");
  });
  it("falls back to the project id, then to nothing", () => {
    expect(sidekickMailName("Playbooks Sidekick", "Proj_42")).toBe("proj-42-sidekick");
    expect(sidekickMailName(null, null)).toBeNull();
    expect(sidekickMailName("Playbooks Sidekick · ???", null)).toBeNull();
  });
  it("stays a valid address for a long project name", () => {
    expect(sidekickMailName(`Playbooks Sidekick · ${"x".repeat(100)}`, null)!.length).toBeLessThanOrEqual(64);
  });
  it("recognises the label", () => {
    expect(isSidekick({ "playbooks/sidekick": "true" })).toBe(true);
    expect(isSidekick({ "playbooks/run": "r" })).toBe(false);
    expect(isSidekick(undefined)).toBe(false);
  });
  it("tells the Sidekick its name", () => {
    expect(sidekickPrompt("x-sidekick")).toContain('"x-sidekick"');
  });
});

describe("the human-decision rule", () => {
  it("names the target, the format and the fallback", () => {
    for (const word of ["role:sidekick", "<project-name>-sidekick", "agent id", "run/playbook", "question", "facts", "recommendation", "paseo ls -g", "playbooks/sidekick", "direct prompt"]) expect(MAIL_NOTE).toContain(word);
  });
});

describe("adoptSidekick", () => {
  async function env() {
    const e = await setup({ debounceMs: 60_000 });
    current = e.mailer;
    e.paseo.projects.set("w1", "proj-a");
    const sidekick = e.paseo.add("sk", { title: "Playbooks Sidekick · Anyshift", workspaceId: "w1" });
    const worker = e.paseo.add("worker", { title: "Worker", workspaceId: "w2" });
    e.paseo.projects.set("w2", "proj-a");
    return { ...e, sidekick, worker };
  }

  it("registers the name and role, and agents resolve it by name and by role", async () => {
    const { mailer, sidekick, worker } = await env();
    expect(await mailer.adoptSidekick(sidekick)).toBe("anyshift-sidekick");
    expect((await mailer.resolve(worker, "anyshift-sidekick"))[0]!.agentId).toBe("sk");
    expect((await mailer.resolve(worker, "role:sidekick"))[0]!.agentId).toBe("sk");
  });

  it("does nothing the second time", async () => {
    const { mailer, sidekick } = await env();
    await mailer.adoptSidekick(sidekick);
    expect(await mailer.adoptSidekick(sidekick)).toBeNull();
  });

  it("keeps a name the Sidekick already chose and adds the role", async () => {
    const { mailer, sidekick, registry } = await env();
    await mailer.register(sidekick, { name: "boss" });
    expect(await mailer.adoptSidekick(sidekick)).toBe("boss");
    expect(registry.get("sk")!.roles).toEqual(["sidekick"]);
  });

  it("gives up quietly when a live agent holds the name", async () => {
    const { mailer, sidekick, paseo } = await env();
    const other = paseo.add("other", { title: "Other" });
    await mailer.register(other, { name: "anyshift-sidekick" });
    expect(await mailer.adoptSidekick(sidekick)).toBeNull();
  });

  it("an unregistered project has no mailbox: sending to the role refuses", async () => {
    const { mailer, worker } = await env();
    await expect(mailer.resolve(worker, "role:sidekick")).rejects.toThrow('no live agent holds the role "sidekick"');
    await expect(mailer.resolve(worker, "anyshift-sidekick")).rejects.toThrow("no live agent is registered");
  });
});
