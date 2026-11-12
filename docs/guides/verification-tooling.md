# Maintain verification tooling

Use this guide when changing repository checks, task orchestration, or their
regression tests. [Verification](verification.md) owns check selection and full
workspace verification milestones; [testing](testing.md) covers test design,
fixtures, and coverage policy. Run commands from the repository root.

## Ownership

Keep tooling with the responsibility it supports:

| Location               | Owns                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tooling/verification` | Repository checks and their regression tests; architecture policy and its resolver live together in `architecture/`. |
| `tooling/testing`      | The `@merit/test-support` package, with explicit database, component setup, and browser exports.                     |
| `tooling/storybook`    | Preview configuration, story execution, browser suites grouped by behavior, and visual baselines.                    |
| `tooling/scripts`      | Repository operations such as resetting the local Compose database.                                                  |

The root [Vite configuration](../../vite.config.ts) owns command orchestration
and imports ordinary [lint policy](../../tooling/verification/lint.ts). Architecture
configuration owns dependency, external-library, and I/O restrictions together.
Keep conventional tool configuration files at the repository root. Application seed and cleanup
scripts remain with the application, and migrations remain with the database
package. Shared compiler options stay in `tooling/react-compiler.ts`.
Capability web test configurations use
[`webTestConfig`](../../tooling/testing/web-config.ts); business configurations use
[`businessTestConfig`](../../tooling/verification/business-test-config.ts). Package
configs retain their additional coverage paths and exclusions. The presets preserve
package-relative test discovery, UI setup, compiler options, and coverage thresholds.

When moving tooling, update its consumers, package exports, TypeScript inclusion,
test discovery, and documentation links together. Keep all existing scenarios and
browser projects discoverable, including the browser-fixture tests in
`test:browser:all`. Preserve the final, exclusive execution of the source-modifying
probes in `ready`.

## Task orchestration and caching

Follow [run-command conventions](development.md#define-run-commands) when defining
or changing tasks.

The [verification tasks](../../vite.config.ts) overlap independent work: after the
build generates application types, static checks and package tests can proceed
together. Tooling regression tests use disposable fixtures and run
alongside them. Package tests run without dependency ordering, with at most four
tasks at a time; they consume workspace source rather than each other's outputs.
The temporary `ready:ci` target retains parallel scheduling while deferring
[approved presentation and tooling self-tests](verification.md#temporary-pr-verification-exception).
`test:ci` guards its retained core checks. The full local `ready` task retains
all tooling self-tests and final source probes.
Database and browser checks start after package tests to limit competing workers.
The application browser suites remain sequential, and the persisted workspace
suite retains its single worker. The coverage and lint probes run last, on their
own, because they temporarily write deliberately invalid source into the workspace.

Static checks restore no files. Coverage reports are outputs rather than inputs,
so unchanged coverage suites can reuse
their result and restore missing reports. Storybook's build caches `dist/` while
excluding its disposable internal cache from tracking.

[Verification](verification.md#verification) explains which checks reuse results,
what invalidates them, and how to request a fresh run or inspect cache behavior.

## Check documentation validation

Run `vp run test:docs` when changing the [Remark configuration](../../.remarkrc.mjs)
or upgrading its dependencies. Its [CLI regression tests](../../tooling/verification/docs.test.ts)
check Markdown and MDX parsing, links between documents, missing files and anchors,
and ignored generated files. `vp run check:docs` checks the actual documentation;
the [documentation guide](documentation.md) describes its scope.

## Check architecture enforcement

The [architecture checks](architecture-checks.md) enforce package dependency
direction, public exports, runtime separation, library ownership, direct I/O
restrictions, and capability TypeScript program isolation.
Run `vp run test:architecture` when changing
[their configuration](../../tooling/verification/architecture/config.ts),
[import rules](../../tooling/verification/architecture/imports.ts), or resolver.
Common business roles apply to new capabilities without registration. Their full
internal import matrix is exercised once against a new capability fixture;
capability-specific integrations retain their own positive and negative checks. Public API
changes belong in the owning package’s `exports`; pure workspace dependencies and
privileged server integrations remain explicit declarations.

The [TypeScript isolation suite](../../tooling/verification/architecture/typescript.test.ts)
runs with `architecture`, enumerates each web capability’s program including
project references, and rejects application or interface source inclusion. Its
negative probes use disposable configurations outside the checkout.

## Check code health

Fallow checks cycles, unused code, and production function complexity. Declare
framework-loaded entry points and complexity policy in
[`.fallowrc.jsonc`](../../.fallowrc.jsonc). `vp run check:complexity` runs
`fallow health --complexity --production --no-cache` and is required by
`ready:static`. It uses the [complexity policy](coding-conventions.md#check-function-complexity);
health-only exclusions do not exempt files from dependency or unused-code checks.

Run `vp run test:fallow` when changing the configuration or upgrading Fallow. Its
[regression tests](../../tooling/verification/fallow.test.ts) cover Merit-specific configuration: package cycles with type-only edges, framework
entry-point discovery, exported interfaces, suppression policy, complexity limits,
production discovery, exclusions, and the configured reviewer exception. Generic
parser, file-cycle, and unused-symbol algorithms are left to upstream tests; the
actual repository checks still run those rules. They also verify
that the static suite runs the complexity command with the tested flags. Run
`vp run check:complexity` against the workspace after a policy change and review
any exception statuses in `fallow health --complexity --production --format json`.

## Check lint and coverage enforcement

Follow the [coverage policy](testing.md#coverage-policy-changes) before weakening
coverage or required tests.

Run `vp run test:checks` when changing formatting, lint, or coverage policy. Run it
without other source checks or test commands, since its probes modify workspace
source temporarily. Its
[regression cases](../../tooling/verification/checks.test.ts) exercise exported arrow functions,
type declarations, CSS Modules,
focused-test rejection, and coverage enforcement through the actual tools.

## Check commit-message validation

Run `vp run test:commits` when changing the [commitlint configuration](../../commitlint.config.mjs),
the [commit-msg hook](../../.vite-hooks/commit-msg), or commitlint dependencies.
The [regression tests](../../tooling/verification/commits.test.ts) exercise the
hook with accepted and rejected message files, including optional scopes,
breaking changes, Git-generated messages, and paths containing spaces.
The suite also runs in `ready:tooling`; it does not create commits.
[Commit conventions](development.md#commit-changes) own contributor guidance.

## Check security enforcement

The root configuration owns the uncached security tasks. The
[secret scanner command](../../tooling/verification/secrets.ts) owns local-only
invocation, redaction, and Git-aware file and history selection;
[its configuration](../../tooling/verification/secrets.config.ts) enables secretlint's
recommended provider rules and records exceptions.
[Security verification](verification.md#security-checks) owns operational scope
and finding handling; [setup](development.md#security-tools) explains how the scanner is pinned.

Run `vp run test:security` after changing the scanner, its configuration, or its
version. The suite uses disposable Git repositories and synthetic credentials to
check untracked and ignored files, force-added files, staged snapshots before the
first commit, removed historical secrets, redaction, and failure outside Git.
It never validates credentials against providers. Run `vp run check:security` to
scan the actual workspace and query current advisories.

Security lint policy remains in the ordinary lint configuration. Its rejection
and acceptance probes run through `vp run test:checks`, exclusively after other
source readers finish, like the existing lint and coverage probes.

## Check shared browser fixtures

The shared browser fixture's [regression tests](../../tooling/testing/browser/checks.spec.ts)
use synthetic pages and run without an application or Storybook server through
`vp run test:browser:tooling`. Its `:all` variant checks every browser project and
is included in `test:browser:all` and `ready`.

Follow the [browser fixture contract](testing.md#browser-fixtures) when changing
error handling, context creation, or cleanup.
