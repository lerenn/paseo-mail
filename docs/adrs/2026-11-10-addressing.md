# Addressing by name or role

Status: Proposed

## Context

Agent ids change whenever an agent is replaced, so senders must not need them. Paseo agents
carry a `title` and string `labels`. The plugin SDK can read both but cannot change them
after creation (no agent update method on the handle).

## Decision

- An address is `name` or `role:<role>`.
- A name matches a live (not archived, not internal) agent whose title equals it, compared
  case-insensitively with whitespace trimmed.
- A role matches every live agent with the label `mail/role=<role>`. The label is set by
  whoever creates the agent (`create_agent` with labels).
- Resolution looks in the sender's workspace first, then its project, then the whole daemon,
  and stops at the first scope with a match.
- A name that matches more than one agent in that scope is an error that lists the matches
  with their workspaces. The sender has to be more specific (for example by renaming).
- Mail is resolved at send time to the agents it reaches, and each recipient gets its own
  copy. Mail to a role reaches the agents that hold it now, not agents created later.
- No match is an error at send time. If the only match is archived, the error says so.
- A recipient archived before reading its mail: the unread copies are returned to the sender
  as a bounce (`Returned: <subject>`), if the sender is still live.
- An agent cannot mail itself.

## Consequences

- Renaming an agent changes its address. Mail already delivered stays with the agent.
- Agents without a title cannot be reached by name.
