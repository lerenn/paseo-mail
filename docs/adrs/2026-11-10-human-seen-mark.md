# A human's "seen" is not the agent's "read"

Status: Accepted. Extends `2026-11-10-mail-store.md`.

## Context

The Mail screen (`2026-11-10-mail-screen.md`) lets a human open agents' mail. A mail client
marks what you opened, but `readAt` drives delivery: unread mail is what an agent is nudged
about, what `Unread: N` counts, and what bounces when the agent is archived. If a human opening
a mail set `readAt`, the agent would never hear of it.

## Decision

- A mail gets a separate field, `seenAt`: when a human opened it on the Mail screen, or null.
  Mail files written before it existed read as `seenAt: null`.
- Opening a mail on the screen sets `seenAt`; **Mark as not opened** clears it. The screen
  shows mail no human opened in bold, with a dot.
- `seenAt` is never read by the mailer: nudges, unread counts, `mail_list`, `mail_read` and
  bounces depend on `readAt` (set only by the recipient's `mail_read`) as before.
- Seen is shared by every human looking at the host (one field per mail, not per person).

## Consequences

- A human can tell what they have looked at without changing what the agent is told.
- Two humans on one host share the mark; per-person marks would need user identities the
  plugin does not have.
