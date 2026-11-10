# Agent instructions

## Architecture Decision Records (ADRs)

Every significant decision gets its own ADR in `docs/adrs/`, added in the same pull request
as the change it describes.

A decision is significant when it changes any of:

- the architecture, or how the plugin talks to Paseo (APIs, hooks, polling or events, RPCs)
- the mailbox model, mail storage, or the agent tools' contract
- compatibility, dependencies, packaging, or the release and versioning process
- the repository's development workflow (CI rules, worktree setup)
- a rule that an earlier decision set (say which one it supersedes)

Bug fixes, refactors, copy edits and visual tweaks need no ADR.

### Format

- File: `docs/adrs/YYYY-MM-DD-<short-slug>.md`, dated the day the decision is taken.
- Sections: **Status** (`Accepted`, or `Superseded by <file>`), **Context**, **Decision**,
  **Consequences**.
- Keep it short: one decision per file.
- Do not rewrite an accepted ADR to change a decision. Write a new ADR that supersedes it,
  and set the old one's Status to `Superseded by <new file>`. Fixing a mistake or a stale
  statement is fine.
- `docs/adrs/2026-11-10-ci-and-release-rules.md` sets the CI checks, branch protection and
  release rules. The plugin design ADRs live alongside it.

## Development workflow

- Work on a branch and open a pull request; `main` is protected.
- A pull request that changes shipped files bumps the version in `package.json`
  (`npm version patch --no-git-tag-version`, or minor / major).
- Keep the CI job names stable (`Typecheck`, `Lint`, `Tests`, `Plugin manifest`,
  `Version bump`): they are the required status checks.
- Mark anything not yet implemented as *planned* on the website.
