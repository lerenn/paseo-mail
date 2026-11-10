# CI, branch protection and release rules

Status: Accepted

## Context

The repository needs the same development workflow as `paseo-playbooks`: every change goes
through a pull request, CI gates it, and users who install the plugin from Git get named
versions. The plugin source did not exist when CI was set up, so CI must pass on an empty
project.

## Decision

- **CI** (`.github/workflows/ci.yml`) runs on pull requests and on `main`, with five jobs
  whose names are the required status checks: `Typecheck`, `Lint`, `Tests`,
  `Plugin manifest` and `Version bump`. Typecheck, lint and tests run the `typecheck`,
  `lint` and `test` npm scripts when they exist, and pass when there is no `package.json`.
  Do not rename these jobs without updating branch protection.
- **Branch protection on `main`**: changes only by pull request, with the five checks above
  required and the branch up to date before merging, and no force pushes.
- **Versioning**: the version lives in `package.json`, starting at `0.1.0`. A pull request
  that changes shipped files (`client/`, `server/`, `shared/`, `skills/`, `assets/`,
  `index.*`, `paseo-plugin.json`, `OVERVIEW*.md`) must increase it; `Version bump` fails
  otherwise, or if `package-lock.json` is out of sync or the version goes backwards.
  Docs, website and CI changes need no bump.
- **Release**: when a new version reaches `main`, the Release workflow creates the tag
  `vX.Y.Z` and a GitHub release with generated notes. The plugin installs from Git, so users
  pin that tag: `paseo plugin install https://github.com/lerenn/paseo-mail.git --ref vX.Y.Z`.
- **Website**: `website/` is deployed to GitHub Pages by `.github/workflows/pages.yml` on
  pushes to `main` that touch it.

## Consequences

- Every user-visible change has a version, a tag and release notes.
- Contributors run `npm version <patch|minor|major> --no-git-tag-version` in pull requests
  that touch shipped files.
- Branch protection, Pages and any custom domain are repository settings that a maintainer
  configures by hand; they are not managed from this repository.
