import { describe, expect, it } from "vitest";
import { MAIL_NOTE, withMailNote } from "./system-prompt";

describe("withMailNote", () => {
  it("is a short rule naming the tools", () => {
    expect(MAIL_NOTE.split("\n").length).toBeGreaterThanOrEqual(4);
    expect(MAIL_NOTE.split("\n").length).toBeLessThanOrEqual(5);
    for (const word of ["mail_register", "mail_send", "mail_reply", "Unread: N", "MUST NOT", "send_agent_prompt"]) expect(MAIL_NOTE).toContain(word);
  });

  it("keeps an existing prompt and appends the note once", () => {
    const existing = "You are a reviewer.\nBe brief.  \n";
    const once = withMailNote(existing)!;
    expect(once.startsWith(existing)).toBe(true);
    expect(once.endsWith(MAIL_NOTE)).toBe(true);
    expect(withMailNote(once)).toBe(once);
    expect(once.split(MAIL_NOTE).length - 1).toBe(1);
  });

  it("uses the note alone when there is no prompt", () => {
    expect(withMailNote(undefined)).toBe(MAIL_NOTE);
    expect(withMailNote(null)).toBe(MAIL_NOTE);
    expect(withMailNote("")).toBe(MAIL_NOTE);
  });

  it("gives up on a prompt that is not a string", () => {
    expect(withMailNote(42)).toBeNull();
    expect(withMailNote({ text: "x" })).toBeNull();
  });
});
