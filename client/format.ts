import type { Mailbox, MailHeader } from "../shared/contracts";

/** The name a mailbox is listed under: registered name, else agent title, else its id. */
export function mailboxLabel(box: Pick<Mailbox, "name" | "title" | "agentId">, noName: string): string {
  return box.name ?? box.title ?? (box.agentId ? box.agentId.slice(0, 8) : noName);
}

/** Who a mail is from: the sender's name at send time, else its title, else its id. */
export function senderLabel(from: MailHeader["from"], plugin: string): string {
  if (from.agentId === null) return from.name ?? plugin;
  return from.name ?? from.title ?? from.agentId.slice(0, 8);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `14:05` today, else `2026-11-03 14:05` (month names would need the locale). */
export function shortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? time : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

/** How many mails of each thread a list holds, to mark rows that have siblings. */
export function threadCounts(mails: readonly Pick<MailHeader, "threadId">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const mail of mails) counts.set(mail.threadId, (counts.get(mail.threadId) ?? 0) + 1);
  return counts;
}
