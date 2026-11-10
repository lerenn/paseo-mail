import { PluginTranslationRuntime } from "@getpaseo/plugin/client/host";
import { describe, expect, it } from "vitest";
import { mailboxLabel, senderLabel, shortDate, threadCounts } from "./format";
import { messages } from "./i18n";

describe("labels", () => {
  it("names a mailbox by registered name, else title, else a short id", () => {
    expect(mailboxLabel({ name: "bob", title: "Bob", agentId: "123456789" }, "?")).toBe("bob");
    expect(mailboxLabel({ name: null, title: "Bob", agentId: "123456789" }, "?")).toBe("Bob");
    expect(mailboxLabel({ name: null, title: null, agentId: "123456789" }, "?")).toBe("12345678");
  });

  it("names the sender, and paseo-mail for returned mail", () => {
    expect(senderLabel({ agentId: "a", name: "alice", title: "Alice" }, "paseo-mail")).toBe("alice");
    expect(senderLabel({ agentId: "abcdefghij", name: null, title: null }, "paseo-mail")).toBe("abcdefgh");
    expect(senderLabel({ agentId: null, name: null, title: null }, "paseo-mail")).toBe("paseo-mail");
  });

  it("shows the time for today and the date otherwise", () => {
    const now = new Date(2026, 10, 10, 18, 0);
    expect(shortDate(new Date(2026, 10, 10, 9, 5).toISOString(), now)).toBe("09:05");
    expect(shortDate(new Date(2026, 10, 3, 14, 5).toISOString(), now)).toBe("2026-11-03 14:05");
    expect(shortDate("not a date", now)).toBe("not a date");
  });

  it("counts the mails of each thread", () => {
    expect([...threadCounts([{ threadId: "a" }, { threadId: "b" }, { threadId: "a" }])]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("translations", () => {
  const keys = (resource: object, prefix = ""): string[] =>
    Object.entries(resource).flatMap(([key, value]) => (typeof value === "string" ? [`${prefix}${key.replace(/_(one|many|other)$/, "")}`] : keys(value, `${prefix}${key}.`)));

  it("translates every English string into French and Chinese", () => {
    const english = new Set(keys(messages.resources.en));
    for (const locale of ["fr", "zh-CN"]) expect(new Set(keys(messages.resources[locale]!))).toEqual(english);
  });

  it("resolves plurals and placeholders in each language", () => {
    let locale = "fr";
    const runtime = new PluginTranslationRuntime({ getLocale: () => locale, subscribe: () => () => undefined });
    expect(runtime.t(messages, "mailboxes.unread", { count: 2 })).toBe("2 non lus par l'agent");
    expect(runtime.t(messages, "mailboxes.unread", { count: 1 })).toBe("1 non lu par l'agent");
    locale = "zh-CN";
    expect(runtime.t(messages, "reader.thread", { count: 3 })).toBe("此会话共 3 封邮件");
    locale = "en";
    expect(runtime.t(messages, "mails.more", { shown: 200, total: 250 })).toBe("Showing the 200 newest of 250.");
    runtime.dispose();
  });
});
