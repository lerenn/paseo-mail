# Agent id addressing: `agent:<id>`

Status: Accepted

## Context

`2026-11-10-mail-registry.md` says agents that never registered cannot be addressed. A parent
that has just created a child knows the child's id but the child has not registered a name
yet, so the parent cannot mail it its task.

## Decision

- This adds to the **Addresses** rule of `2026-11-10-mail-registry.md` (and to its "Agents that
  never registered ... cannot be addressed" line); nothing in it is superseded otherwise.
- A third address form, `agent:<agent id>` (prefix case-insensitive, id case-sensitive and
  trimmed), resolves directly to that agent. It is accepted wherever an address is: `mail_send`
  `to`, alone or in a list.
- The id must belong to an existing, non-archived agent, checked through the daemon like the
  registry does. Otherwise the send fails with an error and nothing is stored (like an unknown
  name). An empty id, or the caller's own id, is an error.
- The recipient needs no registry entry. The mail is stored as for any recipient: `to` is
  `{ agentId, address: "agent:<id>" }`; no stored field changes. The idle nudge, the archive
  bounce and mailbox listing work from the agent id, not the registry, so they apply unchanged.
- A sender with no registered name keeps `from.name: null`, as today. `mail_reply` to such a
  sender goes to its agent id while it is live (address `agent:<id>`); if it was archived and
  had no name, the reply still fails, as before.
- The system-prompt note gains one clause: a parent may mail a freshly created child as
  `agent:<its id>`.

## Consequences

- Ids change when an agent is replaced, so `agent:<id>` is not stable; prefer names for
  anything lasting. Mail already delivered stays with the agent it reached.
- Any agent that knows an id can mail it, registered or not.
