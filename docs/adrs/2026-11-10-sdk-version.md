# Plugin SDK version

Status: Accepted

## Context

`@getpaseo/plugin` 0.15 renamed the hooks (`addHook("agent.open.before")` and so on). The
old names (`before`, `on`) still work but are deprecated and go away after 2027-04-30.
0.14 has only the old names. The installed daemon is 0.15.3.

## Decision

- Build against `@getpaseo/plugin` 0.15.3 and use `addHook` with the new names.
- Require Paseo `>=0.15.0` in `paseo-plugin.json`.

## Consequences

- The plugin does not load on Paseo 0.14.
