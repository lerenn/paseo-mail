# Paseo Mail

A [Paseo](https://github.com/getpaseo/paseo) plugin that gives every agent a mailbox. Agents
send each other mail instead of interrupting each other. A recipient hears about new mail
only when it is idle, never in the middle of a turn.

## Install

```sh
paseo plugin install https://github.com/lerenn/paseo-mail.git --ref vX.Y.Z
```

Requires Paseo 0.15.0 or later.

## How it works

1. **Register.** An agent claims an address with `mail_register`: a unique `name`, and any
   number of shared `roles`. Agent ids change when agents are replaced, so mail is never
   addressed by id.
2. **Send.** `mail_send` takes a name or `role:<role>` (or a list of them). A role reaches its
   holders in the sender's workspace, else its project, else anywhere. An address with no
   live holder is an error, and nothing is sent.
3. **Deliver.** When the recipient is idle, the plugin sends it one line:
   `[paseo-mail] You have N unread mails. Call mail_list to see them.` A recipient in a turn
   is told when the turn ends. It is never woken again for mail it has read or was already
   told about. Only new mail wakes it.
4. **Read and reply.** `mail_list`, `mail_read` and `mail_reply`. Every mail tool result ends
   with `Unread: N`, so an agent already using mail sees new mail without being woken.

Paseo's plugin hooks cannot add text to a turn as it starts, so mail is not injected at turn
start. See `docs/adrs/2026-11-10-no-turn-start-injection.md`.

## The mail rule

When the plugin is installed, every new agent gets a short rule appended to its system prompt
(after whatever Paseo or other plugins set): claim a name with `mail_register` first; use
`mail_send` / `mail_reply` for all non-urgent communication with other agents (updates,
results, questions, handoffs, FYIs); do not interrupt another agent with a direct prompt
unless it is urgent (it is about to do something harmful, or the work is blocked right now);
read mail when nudged or when `Unread: N` shows. The text is `MAIL_NOTE` in
`server/system-prompt.ts`.

The rule is enforced only by the prompt: the plugin cannot block direct prompts between
agents. Agents created before the plugin was installed do not get it; they still have the
tools, the nudge and the `Unread: N` line.

## Returned mail

If a recipient is archived before reading its mail, the mail goes back to the sender as
`Returned: <subject>`. Archiving an agent also releases its name.

## Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `mail_register` | `name?`, `roles?` | Claim or change your name and roles. `name: ""` releases the name, `roles: []` clears the roles, and no arguments shows your registration. |
| `mail_directory` | none | List the registered names and roles. |
| `mail_send` | `to`, `subject`, `body` | Send mail to a name, `role:<role>`, or a list of them. |
| `mail_list` | `unread_only?`, `limit?` | List your mail, newest first, without bodies. |
| `mail_read` | `id` | Read one mail and mark it read. |
| `mail_reply` | `id`, `body` | Reply to the sender, in the same thread. |

On Claude the tools show up as `mcp__paseo__mail_*`.

## Storage

Mail and the registry live in `$PASEO_HOME/plugin-data/paseo-mail/` (by default
`~/.paseo/plugin-data/paseo-mail/`): one JSON file per mail in `mail/`, and `registry.json`.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
```

Design decisions are recorded in `docs/adrs/`; see `AGENTS.md` for the rules.
