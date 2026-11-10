# Delivery: no turn-start injection, idle nudge only

Status: Proposed

## Context

We wanted two delivery paths: unread mail injected into a turn as it starts, and a nudge
when the recipient is idle. Checked against `@getpaseo/plugin` 0.15.3 (the installed daemon)
and 0.16.0-beta.1:

- `agent.turn.before` (legacy `agent.turn_started`) is emitted from the provider's
  `turn_started` stream event, after the prompt has gone to the provider. It is registered
  `waits: false` and returns nothing: a notification only.
- `agent.open.before` (legacy `agent.session_open`) may change only `env`, `tools` and
  `mcpServers`; the daemon rejects any other change. It runs at session open, not per turn.
- `agent.create.before` may set `config.systemPrompt`, but only once, when an agent is created.
- `agents.ref(id).send(text, { activeTurnBehavior })` accepts only `interrupt` (the default)
  or `steer`. There is no "queue until the turn ends".
- `timeline.append()` adds a plugin item for the app to render; the model does not see it.

So no hook can add text to a turn that is starting.

## Decision

- Drop turn-start injection. The only active delivery is the idle nudge
  (`2026-11-10-idle-nudge.md`).
- As a passive fallback, every mail tool result ends with the caller's unread count, so an
  agent that is already using mail sees new mail without a nudge.
- Agents learn about mail from the tool descriptions. We do not edit system prompts in v1.

## Consequences

- Mail that arrives during a turn is seen when that turn ends, never during it.
- If Paseo adds a waiting turn-start hook that can add context, we can add the injection path
  in a new ADR without changing the store or the tools.
