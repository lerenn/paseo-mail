# Mail registry: names and roles

Status: Accepted

## Context

Agent ids change whenever an agent is replaced, so senders must not need them. Agent titles
are set by Paseo or by humans and are not unique. Plugins cannot change an agent's title or
labels after it is created. So the plugin keeps its own registry, and agents claim their
addresses in it.

## Decision

- An agent claims addresses with `mail_register { name?, roles? }`. The registry lives in
  `$PASEO_HOME/plugin-data/lerenn/mail/registry.json` and maps an agent id to one optional
  name and a set of roles, with the agent's workspace and project.
- Names and roles are lower-cased and trimmed, and must match `[a-z0-9][a-z0-9._-]{0,63}`.
- **Names are unique** across the daemon. Claiming a name held by another live agent is an
  error that names the holder. A name held by an archived or missing agent is free, and is
  taken over.
- **Roles are shared**: any number of agents can hold the same role.
- **Re-register**: the fields given replace the caller's current ones. A new `name` releases
  the old one, `name: ""` releases it without taking another, and `roles` replaces the whole
  set (`[]` clears it). Omitted fields are kept. `mail_register {}` changes nothing and
  returns the current registration.
- **Release**: on `agent.archive.after` the agent's entry is removed, so its name is free.
  An archive the plugin missed (it was not running) is caught when the name is next resolved
  or claimed: the holder is checked, and dropped if archived or missing.
- **Addresses**: `<name>` or `role:<role>`.
  - A name resolves, at send time, to the one live agent holding it.
  - A role resolves to its live holders in the sender's workspace, else its project, else
    the whole daemon: the first scope that has any.
  - Each recipient gets its own copy, stored against its agent id. Mail is not re-routed
    later: if the name passes to another agent, mail already delivered stays with the first.
- **Unknown address** (no live holder): the send fails with an error, nothing is stored.
- **Recipient archived before reading**: its unread copies are returned to the sender as a
  bounce (`Returned: <subject>`), if the sender is still live.
- Agents that never registered can send mail but cannot be addressed. An agent cannot mail
  itself.
- `mail_directory` lists registered names and roles, so agents can find each other.

## Consequences

- An address stays stable when an agent is replaced, as long as the new agent claims the same
  name. The old one must be archived first, or release the name.
- A role with no holder in any scope is an error, like an unknown name.
