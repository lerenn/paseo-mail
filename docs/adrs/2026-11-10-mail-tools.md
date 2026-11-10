# Agent tools

Status: Accepted

## Context

Agents use mail through plugin tools. The plugin adds them in `agent.open.before`, so every
interactive session gets them. The calling agent is known from the tool context.

## Decision

Six tools, given to every interactive (non-history) session:

- `mail_register { name?, roles? }`: claim a name and roles (`2026-11-10-mail-registry.md`).
- `mail_directory {}`: registered names and roles, with their agents' titles.
- `mail_send { to, subject, body }`: `to` is one address or a list. Returns the mail ids
  and who each one reached.
- `mail_list { unread_only?, limit? }`: the caller's inbox, newest first: id, from, subject,
  date, read or not. No bodies. `limit` defaults to 20.
- `mail_read { id }`: the whole mail. Marks it read. Only its recipient can read it.
- `mail_reply { id, body }`: replies to the sender in the same thread, with subject
  `Re: <subject>`. Goes to the sender's agent if still live, else to the agent now holding
  the sender's registered name; an error if neither exists.

Every result ends with `Unread: N` for the caller.

## Consequences

- Tool names are the contract: renaming one is a breaking change.
- On Claude they show up as `mcp__paseo__mail_*`.
