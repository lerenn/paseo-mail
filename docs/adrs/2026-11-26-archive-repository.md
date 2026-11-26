# Archive the repository

## Status

Accepted

## Context

Paseo 0.17 makes messages from other agents wait for the current turn to end by default
(getpaseo/paseo#9757, #10404). That covers the main goal of this plugin, avoiding interruptions
between agents.

## Decision

Retire Paseo Mail. Add an archive notice at the top of the README and ask the registry to remove
the `lerenn/mail` listing (getpaseo/plugins#3390). No further features are planned.

## Consequences

The repository stays available and installed copies keep working, but receive no updates. The
listing leaves paseo.sh/plugins once the registry reviewer removes it.
