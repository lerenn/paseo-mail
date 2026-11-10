# A Mail entry in the sidebar, with a mail-client screen

Status: Accepted

## Context

Agents' mail was visible only to the agents, through the mail tools. A human overseeing them
had no way to see who mails whom, what is waiting unread, or what bounced, short of reading
the JSON files in `plugin-data`. `paseo-playbooks` already has a sidebar entry that opens an
all-workspaces screen (its `2026-11-05-sidebar-screen.md`), so the SDK pattern is known.

## Decision

- A **Mail** row in Paseo's left sidebar (`addSidebarHeaderItem`, icon `Mail`) opens a
  **Mail screen** (`addScreen`, id `mail`) that looks like a mail client, in three panes:
  1. **Mailboxes**: every agent that holds a registration or has received mail, by registered
     name (else the last name it sent as, else its title), with its title and roles, and the
     count of mail its agent has not read. Archived or gone agents are listed last, under
     **Archived**, with how many of their mails were returned to the senders.
  2. **Mail** of the selected mailbox, newest first: sender, subject, date, a one-line preview,
     an *unread* tag while its agent has not read it, *returned* when it bounced, and a thread
     count when the mailbox holds other mails of the same thread.
  3. **Reader**: the selected mail and its whole thread (across mailboxes) oldest first, each
     with its body (Markdown), whether and when its agent read it, was nudged, or had it
     returned.
- On wide layouts the panes sit side by side; on compact layouts (`layout.compact`) one pane
  shows at a time, with a back button. The client uses React Native primitives and the SDK's
  UI components only (CI's mobile audit).
- **View only.** The screen offers no send, reply or "mark read" for an agent: a human must not
  act as an agent. Its one write is the human-only seen mark (`2026-11-10-human-seen-mark.md`),
  plus an **Open agent** link to a live recipient.
- Five RPCs in `shared/contracts.ts`, validated with zod like the playbooks contracts:
  `mail.revision`, `mailboxes.list`, `mails.list` (headers only, `limit` 1–1000, default 200),
  `mails.view` (one mail and its thread) and `mails.seen`.
- **Live refresh by revision poll.** The SDK cannot push from the daemon to the client, and mail
  changes (`mail_send`, `mail_read`, a nudge) happen inside agent turns, where Paseo's agent
  events (which the playbooks panel listens to) say nothing about mail. The store and the
  registry count their changes; `mail.revision` returns them with a per-boot id. While a Mail
  screen is open the client polls it every 3 s and refetches the mailboxes, the open list and
  the open mail only when it moved; a 60 s full refresh catches what the revision does not
  (an agent renamed or archived with no mail to bounce). Nothing polls while no screen is open.
- The daemon is asked about each mailbox's agent on every mailbox fetch; an agent found
  archived or gone is remembered and not asked again.
- No badge on the sidebar row: unread counts belong to the agents, and a badge would need a
  poll while no screen is open.
- Every user-visible string is translated (English, French, Simplified Chinese) with the SDK's
  `defineTranslations`, unlike the playbooks panel. Names, subjects and bodies show as written.

## Consequences

- A human can follow agent mail live, within about 3 s, at the cost of one tiny RPC every 3 s
  per open screen.
- Mail that a human needs to act on still goes through an agent; there is no human mailbox.
- `index.client.tsx`, `client/` and `shared/` are now shipped files, and React and React Native
  are dev dependencies (the host provides them at run time).
- A new user-visible string needs its French and Chinese text in `client/i18n.ts`; a test
  fails when a language misses a key.
