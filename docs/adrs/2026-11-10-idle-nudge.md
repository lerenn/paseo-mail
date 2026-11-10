# Idle nudge

Status: Accepted

## Context

Mail must never interrupt a running turn, and an agent must not be woken again for mail it
was already told about or has read. The playbooks plugin solves the same "send only when
idle" problem in `agentNotifier()`: it keeps a busy set from the turn hooks and from its own
sends, and checks the agent's status when it has no record of it.

## Decision

- An agent is busy from `agent.turn.before` to `agent.turn.after`, and from the moment the
  plugin sends it a nudge. Before nudging, the plugin refreshes the agent and nudges only if
  its status is `idle` and it is not archived. Otherwise the nudge is held.
- A nudge is one line, sent with `agents.ref(id).send()`, which starts a normal turn:
  `[paseo-mail] You have N unread mail(s). Call mail_list to see them.`
- Each mail records `nudgedAt`. A nudge goes out only if the agent has unread mail with no
  `nudgedAt`, and stamps every unread mail when it goes out. Mail the agent has read, or was
  already nudged about, never wakes it again. Only new mail does.
- When to try: shortly after a send (debounced about 1 s, so a burst gives one nudge), on
  `agent.turn.after`, and once when the plugin starts (for mail held over a daemon restart).
- The send uses `activeTurnBehavior: "steer"` only as the fallback for the gap between the
  status check and the send, where the agent may have just started a turn: a steered
  one-line note is less harmful than the default, which interrupts the turn. The plugin never
  chooses to send into a turn it knows is running.
- A failed send clears the stamps it set, so the nudge is tried again later.

## Consequences

- An idle agent waiting for a human will be woken by mail. That is the intent: mail is for
  agents free to act on it.
- An agent that ignores a nudge keeps its unread mail, and sees the count in its next mail
  tool result or the next nudge for new mail.
