# Idle nudge

Status: Proposed

## Context

Mail must never interrupt a running turn, and an agent must not be woken again for mail it
was already told about or has read. The playbooks plugin solves the same "send only when
idle" problem in `agentNotifier()`: it keeps a busy set from the turn hooks and from its own
sends, and checks the agent's status when it has no record of it.

## Decision

- An agent is busy from `agent.turn.before` to `agent.turn.after`, and from the moment the
  plugin sends it a nudge. Before nudging, the plugin refreshes the agent: it nudges only if
  the status is `idle` and the agent is not archived. In any other status the nudge is held.
- A nudge is one line, sent with `agents.ref(id).send()`, which starts a normal turn:
  `[paseo-mail] You have N unread mail(s). Call mail_list to see them.`
- Each mail records `nudgedAt`. A nudge goes out only if the agent has unread mail with no
  `nudgedAt`, and every unread mail is stamped when it goes out. Mail the agent has read, or
  was already nudged about, never wakes it again. Only new mail does.
- When to try: shortly after a send (debounced about 1 s, so a burst gives one nudge), on
  `agent.turn.after`, and once when the plugin starts (for mail held over a daemon restart).
- The send uses `activeTurnBehavior: "steer"` only to cover the gap between the status check
  and the send, where the agent may have just started a turn. A steered one-line note is less
  harmful than the default, which interrupts. The plugin never chooses to steer a turn it
  knows is running.

## Consequences

- An agent waiting for a human (idle) will be woken by mail. That is the intent: mail is for
  agents that are free to act on it.
- An agent that ignores a nudge keeps its unread mail. It will see the count in its next mail
  tool result or the next nudge for new mail.
