# Durable mail store

Status: Accepted

## Context

Mail must survive daemon restarts. The playbooks plugin keeps its state in
`$PASEO_HOME/plugin-data/<plugin-id>/`, outside the plugins folder Paseo manages, with
atomic writes and serialized mutations.

## Decision

- Mail lives in `$PASEO_HOME/plugin-data/paseo-mail/mail/` (default `~/.paseo`), one JSON
  file per mail, written atomically (temp file, then rename). Writes are serialized.
- A mail holds: `id`, `threadId`, `inReplyTo`, `from` (agent id and name at send time),
  `to` (agent id, and the address as typed), `subject`, `body`, `createdAt`, `readAt`,
  `nudgedAt`, `bouncedAt`.
- Unreadable files are skipped with a log line, not fatal.
- Nothing is deleted in v1.

## Consequences

- One file per mail keeps writes small. Listing uses an in-memory index loaded at start.
- Retention and cleanup are a later decision.
