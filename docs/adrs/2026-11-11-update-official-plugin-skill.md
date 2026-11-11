# Skill to publish releases to the official plugin registry

## Status

Accepted

## Context

The listing on paseo.sh/plugins is the registry `getpaseo/plugins`. Updates are manual: a
submission issue naming a release tag. The sibling `paseo-playbooks` repository already has a
skill for this.

## Decision

Copy the `update-official-plugin` skill into `.agents/skills/`, adapted to `lerenn/paseo-mail`
(including the first submission, since the plugin is not listed yet).

## Consequences

Agents can submit a release to the registry the same way each time. Opening the issue stays
public, so the skill asks for the user's approval first.
