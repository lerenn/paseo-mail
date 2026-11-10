# Mail rule in new agents' system prompt

Status: Accepted

## Context

`2026-11-10-no-turn-start-injection.md` said agents learn about mail only from the tool
descriptions, with no system-prompt note. In practice agents then keep interrupting each
other with direct prompts, because nothing tells them mail is the expected channel.
`agent.create.before` can change `config.systemPrompt`, once, when an agent is created. The
daemon runs it for every agent except internal ones, passes each plugin the request as the
previous plugin left it (plugins in id order), stores the resulting prompt with the agent, and
fails the agent's creation if a hook throws.

## Decision

- This supersedes the "No system-prompt note" part of
  `2026-11-10-no-turn-start-injection.md`. The rest of that ADR stands.
- On `agent.create.before` the plugin appends a short rule (`MAIL_NOTE` in
  `server/system-prompt.ts`, 4 to 5 lines) to the agent's system prompt:
  - claim a name with `mail_register` first;
  - agents MUST use `mail_send` / `mail_reply` for all non-urgent communication with other
    agents (updates, results, questions, handoffs, FYIs);
  - agents MUST NOT interrupt another agent with a direct prompt (`send_agent_prompt` or
    similar) unless it is urgent: the other agent is about to do something harmful, or the
    work is blocked right now and cannot wait for its next turn;
  - read mail when nudged or when a tool result shows `Unread: N`.
- The rule is appended after any existing prompt, separated by a blank line, and never
  replaces it. A prompt that already contains the rule is left as it is.
- The hook does nothing for internal agents, for a prompt that is not a string, or on any
  error: it never throws, so it cannot break agent creation.

## Consequences

- Known limit: the rule is enforced only by the prompt. The plugin cannot block or reroute
  direct sends between agents, so an agent may still ignore it.
- Agents created before the plugin was installed (or while it was disabled) do not get the
  rule. They still have the tools, the nudge and the `Unread: N` line.
- Changing `MAIL_NOTE` affects only agents created afterwards.
