# An agent needs a registered name to read its mail

Status: Accepted

## Context

Mail is stored under the recipient's agent id, and `2026-11-10-agent-id-addressing.md` lets
anyone mail `agent:<id>` with no registry entry. So an agent that never registered could
read its mail without a name, and the sender never learned an alias to use. We want every
agent to have an alias before it reads.

## Decision

- This refines `2026-11-10-agent-id-addressing.md` and `2026-11-10-mail-registry.md`. Nothing
  in them is superseded: sending, `agent:<id>`, roles, names and the archive bounce work as
  before. What is added is a condition on reading.
- `mail_list` and `mail_read` refuse while the caller has no registered **name** (a role-only
  registration does not count). The error says to call `mail_register { name }` first, and
  how many unread mails are waiting (a count, no subject or body). Mail stays stored under
  the agent id; once the agent registers it sees it all, nothing is redirected.
- `mail_send` and `mail_reply` need no name. Their result says `use "<name>" from now on`
  for a recipient that has a name, and warns when the caller has none that recipients cannot
  reply by alias.
- The idle nudge for an agent with no name says it has N unread mails it cannot read until it
  registers, to call `mail_register` with a descriptive name, read them, and `mail_reply` so
  the sender learns its alias. Once named, the normal text is used. The rules of
  `2026-11-10-idle-nudge.md` are unchanged: idle only, once per mail (`nudgedAt`), so
  registering after a nudge does not cause another one.
- The `Unread: N` suffix says, for an unnamed caller, that it cannot read until it registers.
- `MAIL_NOTE` (system-prompt note) says to register first, that mail can only be read after
  registering, and to prefer names to `agent:<id>` once known.
- The Mail screen's RPCs (`server/viewer.ts`) are for humans and do not look at the agent's
  registration: unchanged.

## Consequences

- An agent given a task by `agent:<id>` must register before it can read it; the nudge tells
  it so. A role-only agent is still blocked.
- The refusal exposes the unread count only, which the `Unread: N` line already did.
