# Sidekick mailbox and human-decision rule

Status: Accepted

## Context

The paseo-playbooks plugin runs one Sidekick agent per project (label `playbooks/sidekick`,
title `Playbooks Sidekick · <project>`) that takes over human decisions from the retired
Playbook Meta-Manager. paseo-playbooks must stay unaware of mail, so paseo-mail does the wiring.

## Decision

- `MAIL_NOTE` gets a fifth line (supersedes the "4 to 5 lines" wording of
  `2026-11-10-system-prompt-note.md` only in that the rule now covers human decisions): an agent
  that needs a human decision and is not in a live conversation with the human mails the
  Sidekick (`role:sidekick`, which resolves to the sender's workspace, else project, else anywhere)
  instead of asking the human, with: agent id, run/playbook, question, facts, recommendation.
- On `agent.open.before`, an agent whose labels hold `playbooks/sidekick` is registered by the
  plugin as `<project-name>-sidekick` with the role `sidekick`. The project name is the part of
  the agent title after ` · `, else the project id, lower-cased and reduced to `a-z0-9-`. A name
  the Sidekick already holds is kept; a name held by another live agent is skipped. Once done,
  a short prompt tells the Sidekick its mailbox (read when nudged, answer with `mail_reply`).
- Fallback: when no Sidekick mailbox exists (`mail_send` refuses), the rule tells agents to find
  its id with `paseo ls -g` (label `playbooks/sidekick`) and send a direct prompt, without
  interrupting it unless urgent.

## Consequences

- No dependency on paseo-playbooks code; only its label and title convention.
- Enforced only by the prompt, like the rest of the rule; older agents lack it.
- Renaming a project does not rename an existing mailbox until the name is released.
