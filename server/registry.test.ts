import { afterEach, describe, expect, it } from "vitest";
import { setup } from "./fixtures";
import { normalize } from "./registry";
import type { Mailer } from "./mailer";

let current: Mailer | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

describe("normalize", () => {
  it("lower-cases and trims", () => {
    expect(normalize("  Reviewer ", "name")).toBe("reviewer");
  });
  it("refuses bad characters", () => {
    expect(() => normalize("two words", "name")).toThrow(/invalid name/);
    expect(() => normalize("", "role")).toThrow(/invalid role/);
    expect(() => normalize("-x", "name")).toThrow();
  });
});

describe("mail_register", () => {
  it("keeps names unique among live agents", async () => {
    const { paseo, mailer } = await setup();
    current = mailer;
    const a = paseo.add("a", { title: "Agent A" });
    const b = paseo.add("b");
    await mailer.register(a, { name: "Reviewer" });
    await expect(mailer.register(b, { name: "reviewer" })).rejects.toThrow(/held by another agent \("Agent A"\)/);
  });

  it("frees the name of an archived holder", async () => {
    const { paseo, registry, mailer } = await setup();
    current = mailer;
    const a = paseo.add("a");
    const b = paseo.add("b");
    await mailer.register(a, { name: "reviewer" });
    paseo.archive("a");
    expect((await mailer.register(b, { name: "reviewer" }))?.name).toBe("reviewer");
    expect(registry.get("a")).toBeUndefined();
  });

  it("lets roles be shared", async () => {
    const { paseo, mailer } = await setup();
    current = mailer;
    await mailer.register(paseo.add("a"), { roles: ["qa"] });
    await mailer.register(paseo.add("b"), { roles: ["QA", "qa"] });
    const entries = await mailer.directory();
    expect(entries.map((e) => e.registration.roles)).toEqual([["qa"], ["qa"]]);
  });

  it("replaces given fields and keeps omitted ones on re-register", async () => {
    const { paseo, registry, mailer } = await setup();
    current = mailer;
    const a = paseo.add("a", { workspaceId: "w1" });
    paseo.projects.set("w1", "p1");
    await mailer.register(a, { name: "one", roles: ["x", "y"] });
    await mailer.register(a, { name: "two" });
    expect(registry.get("a")).toMatchObject({ name: "two", roles: ["x", "y"], workspaceId: "w1", projectId: "p1" });
    expect(registry.holderOf("one")).toBeUndefined();
    await mailer.register(a, { roles: [] });
    expect(registry.get("a")?.roles).toEqual([]);
    expect((await mailer.register(a, {}))?.name).toBe("two");
    expect(await mailer.register(a, { name: "" })).toBeNull();
    expect(registry.get("a")).toBeUndefined();
  });

  it("releases the name when the agent is archived", async () => {
    const { paseo, registry, mailer } = await setup();
    current = mailer;
    await mailer.register(paseo.add("a"), { name: "reviewer", roles: ["qa"] });
    await mailer.onArchived("a");
    expect(registry.list()).toEqual([]);
  });

  it("persists across restarts", async () => {
    const first = await setup();
    await first.mailer.register(first.paseo.add("a"), { name: "reviewer" });
    await first.mailer.dispose();
    const second = await setup({}, first.root);
    current = second.mailer;
    expect(second.registry.holderOf("reviewer")?.agentId).toBe("a");
  });
});
