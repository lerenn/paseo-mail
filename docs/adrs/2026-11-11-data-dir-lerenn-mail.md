# Data directory moves to plugin-data/lerenn/mail

Status: Accepted

## Context

Mail data lived in `$PASEO_HOME/plugin-data/paseo-mail/`. The plugin is published under the
`lerenn` namespace as `mail`, so its data directory should match.

## Decision

- Data lives in `$PASEO_HOME/plugin-data/lerenn/mail/` (default `~/.paseo`), with the same
  layout inside (`mail/`, `registry.json`).
- On startup, before the store and registry load, if the old `plugin-data/paseo-mail/`
  exists and the new directory does not, the old one is renamed to the new one.
- If both exist, nothing is moved and the new directory wins.

## Consequences

- Existing installs keep their mail with no manual step.
- Updates the location stated in `2026-11-10-mail-store.md`.
