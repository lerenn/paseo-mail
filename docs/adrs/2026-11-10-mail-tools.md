# Agent tools

Status: Proposed

## Context

Agents use mail through plugin tools. The plugin adds them in `agent.open.before`, so every
interactive session gets them. The calling agent is known from the tool context.

## Decision

Four tools, given to every interactive (non-history) session:

- `mail_send { to, subject, body }`: `to` is one address or a list of them
  (`2026-11-10-addressing.md`). Returns the mail ids and who each one reached.
- `mail_list { unread_only?: true, limit?: 20 }`: the caller's inbox, newest first:
  id, from, subject, date, read or not. No bodies.
- `mail_read { id }`: the whole mail. Marks it read. Only the recipient can read it.
- `mail_reply { id, body }`: replies to the sender, in the same thread, with subject
  `Re: <subject>`. Goes to the original sender's agent id. If that agent is archived, the
  sender's name is resolved again, as in a new send.

Every result ends with `Unread: N`.

## Consequences

- Tool names are the contract: renaming one is a breaking change.
- On Claude they show up as `mcp__paseo__mail_*`.
