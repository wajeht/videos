# Anti-slop provenance

## Installed source

- Source: https://github.com/dmmulroy/anti-slop
- Verified commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.
- Source directory: `skills/install-anti-slop/assets/anti-slop/`.
- Installed directory: `tools/oxlint/anti-slop/`.
- The supplied skill bundle was compared byte-for-byte with that commit before merging. Every installed source file matches the bundle; this provenance file is a local addition.
- Preserve `vendor/eslint-stylistic/LICENSE` and its `UPSTREAM.md`, which identify the separately vendored spacing rule.

## Update baseline and backup

The previous pristine bundled source is recoverable from this repository at commit `25766ed03808ae1682024868497c4e6b938f12e8`, directory `.agents/skills/install-anti-slop/assets/anti-slop/`, Git tree `20b3b160835bb6f2fca239acc5114a1cab1c59c7`. Its files matched the installed implementation exactly; there were no local rule customizations or deletions to reconcile. The prior upstream commit was not recorded.

The complete incoming snapshot has been reconciled. Use the verified upstream commit above as the next source baseline. A pre-update backup, incoming/base snapshots, dependency manifests, original worktree status and diff, test logs, and proposed-rule diagnostics are retained at `/private/tmp/videos-anti-slop-m654z4b4/`.

Pre-existing changes to `.agents/skills/install-anti-slop/` and `skills-lock.json` were preserved.

## Adopted changes and local policy

- Adopted all incoming implementation changes: lexical and generic type-alias resolution, shared parameter/scope helpers, improved type-predicate handling, valid undefined-existence probes, borrowed member names, and configurable nonempty safety justifications.
- Added the array-pipeline, reducer-copy, and readable-spacing rules and their shared helpers and vendored dependencies.
- Updated the optional Effect source with the bundle. Effect remains unregistered because this application has no direct Effect dependency.
- Existing plugin registration, rule severities, options, overrides, and lint/format ignores are unchanged. No application cleanup was performed.
- New rules remain unconfigured pending approval: `anti-slop/no-array-filter-map`, `anti-slop/no-reduce-accumulator-copy`, and `anti-slop/require-readable-spacing`, plus the native companion `oxc/no-accumulating-spread`. Proposed severity is `error` for all four.
- A read-only trial with these four enabled reports 3 array-pipeline findings and 1,581 spacing findings across 175 owned files; no reducer-copy or accumulating-spread findings. Agent assets and vendored rules were excluded using the existing ignore policy.
- Dependency declarations and lockfile are unchanged. Installed packages were synchronized to the already pinned `oxlint@1.82.0` and `@oxlint/plugins@1.82.0`; npm also synchronized other installed dependencies to their existing declarations.

## Verification

- All 24 matching upstream rule test suites passed against a copy of the installed implementation with Oxlint 1.82.0. Tests were retrieved from the verified commit, not guessed from the skill bundle.
- The spacing CLI test's package-runner invocation was adapted only in temporary staging to use this repository's Node/Oxlint executable instead of pnpm; its assertions were unchanged. It verified rejection, whitespace fixes, attached documentation, and repeated-fix stability on fixtures.
- Strict TypeScript checking of the installed plugin and matching upstream tests passed in staging.
- Application typechecks, lint, formatting, all 311 unit tests, production build, and all 18 browser tests passed. The first browser run could not launch because the pinned Playwright version required a browser not yet installed; after installing the matching Chromium version, all browser tests passed.
