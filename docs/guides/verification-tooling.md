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
| `tooling/agents`       | Stateless maintenance CLIs (`scout.ts`, `proposal.ts`, `queue.ts`) and their unit tests.                             |
| `tooling/scripts`      | Repository operations such as resetting the local Compose database.                                                  |

The root [Vite configuration](../../vite.config.ts) owns command orchestration
and imports ordinary [lint policy](../../tooling/verification/lint.ts). Architecture
configuration owns dependency, external-library, and I/O restrictions together.
Keep conventional tool configuration files at the repository root. Application seed and cleanup
scripts remain with the application, and migrations remain with the database
package. Shared compiler options stay in `tooling/react-compiler.ts`, and
argument and path helpers shared by tooling CLIs stay in [`tooling/cli.ts`](../../tooling/cli.ts).
Start a CLI with `if (import.meta.main)` rather than comparing `process.argv[1]`
with the module path. Scripts that CI runs before installing dependencies import only
Node built-ins, so they keep local copies of these helpers.
Capability web, product, and app Vitest configurations use
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
alongside them. Package tests run without dependency ordering, with at most two
packages concurrently so worker pools do not saturate shared runners; they consume
workspace source rather than each other's outputs. In CI, the
[PR verification workflow](development.md#pull-request-verification) splits those
stages into jobs, and `test:ci` verifies that every `ready` stage and
workflow invariant remains covered. `ci:summary` ([`ci-summary.ts`](../../tooling/verification/ci-summary.ts))
publishes structured Playwright and Vitest step summaries on CI, marking each failed
browser test as failed or flaky.
Database and browser checks start after package tests locally to limit competing workers.
The application browser suites remain sequential locally, and the persisted workspace
suite retains its single worker. The coverage and lint probes run last, on their
own, because they temporarily write deliberately invalid source into the workspace.

Static checks restore no files. Coverage reports are outputs rather than inputs,
so unchanged coverage suites can reuse
their result and restore missing reports. Storybook's build caches `dist/` while
excluding its disposable internal cache from tracking. The Storybook browser
suite's server runs that cached build before serving `dist/`, so the suite reuses
an unchanged build and stays current when Playwright runs without `vp run`.

[Verification](verification.md#verification) explains which checks reuse results,
what invalidates them, and how to request a fresh run or inspect cache behavior.

## Find recurring browser failures

Run `vp run ci:browser-history` with an authenticated GitHub CLI to inspect the
latest 100 Verify runs. Pass a run count to change the sample, for example
`vp run ci:browser-history 30`. Each row counts runs where a named Playwright
test failed on the first attempt, and how many then passed, either on its CI
retry or in the same shard on a rerun of that workflow run and commit. The report uses
completed successful or failed runs with retained job logs. Cancellations,
setup failures without a test result, and non-browser jobs are excluded.

## Check documentation validation

Run `vp run test:docs` when changing the [Remark configuration](../../.remarkrc.mjs)
or upgrading its dependencies. Its [CLI regression tests](../../tooling/verification/docs.test.ts)
check Markdown and MDX parsing, links between documents, missing files and anchors,
and ignored generated files. `vp run check:docs` checks the actual documentation;
the [documentation guide](documentation.md) describes its scope.

## Check verification records

The `verification-record` job runs
[`verification-record.ts`](../../tooling/verification/verification-record.ts) on
pull requests. It owns the required record sections, exemptions, and diff rules
that the [verification guide](verification.md#record-verification) describes; keep
the guide's template and the script's sections in step. Run `vp run test:ci`
after changing either. Change routing treats records as documentation, so a
record never widens the checks a pull request runs.

Records are data about one change, not guidance for later work. The root
[`.ignore`](../../.ignore) keeps `verifications/` out of ripgrep-based search, which
coding agents use to find guidance, while Git, formatting, the documentation check,
and secret scanning still include the records. The regression tests assert that
entry remains.

The separate [Review Packet workflow](../../.github/workflows/review-packet.yml)
runs [`pr-review-packet.ts`](../../tooling/verification/pr-review-packet.ts) on
same-repo pull requests with `pull-requests: write` while keeping `verify.yml`
read-only. Run
`vp run ci:review-packet -- --base origin/main --head HEAD --pr <number>` to
preview the sticky comment locally, and run `vp run test:ci` after changing it.

## Check architecture enforcement

[Architecture checks](architecture-checks.md#change-a-guarantee-deliberately)
explain what `vp run test:architecture` covers and when to run it after changing
the [configuration](../../tooling/verification/architecture/config.ts),
[import rules](../../tooling/verification/architecture/imports.ts), resolver, or
[mechanisms checker](../../tooling/verification/architecture/mechanisms.ts).

## Check code health

Fallow checks cycles, unused code, and production function complexity, configured
in [`.fallowrc.jsonc`](../../.fallowrc.jsonc). The
[complexity policy](coding-conventions.md#check-function-complexity) explains
`vp run check:complexity`; health-only exclusions do not exempt files from
dependency or unused-code checks.

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
recommended provider rules, adds rules for Resend API keys and Clerk secret keys,
and records exceptions. The added rules report under their own IDs because
redaction hides finding details.
[Security verification](verification.md#security-checks) owns operational scope
and finding handling; [setup](development.md#security-tools) explains how the scanner is pinned.

Run `vp run test:security` after changing the scanner, its configuration, or its
version. The suite uses disposable Git repositories and synthetic credentials to
check untracked and ignored files, force-added files, staged snapshots before the
first commit, removed historical secrets, redaction, failure outside Git, and
each added provider rule against a matching key and near misses.
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

## Rule enforcement

When the same mistake recurs, move enforcement up the ladder (**architecture ->
types -> lint or CI -> tests -> documentation**) and prove a new static or test
check fails on the past mistake. Rules still marked prose/review below are the
next candidates for tooling.

| Rule                                                                  | Enforcer                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Capability, role, and browser/server seams                            | `vp run architecture` ([architecture config](../../tooling/verification/architecture/config.ts))                                         |
| Dead code, unused exports, package cycles                             | `vp run code-health` & `vp run architecture` ([Fallow config](../../.fallowrc.jsonc))                                                    |
| Function length, complexity, unsafe `any`                             | `vp run check:code` & `vp run check:complexity` ([lint rules](../../tooling/verification/lint.ts))                                       |
| No `!`, unsafe `as`, or unreasoned suppressions                       | `vp run check:code` ([lint rules](../../tooling/verification/lint.ts))                                                                   |
| Business core branch coverage                                         | `vp run <package>#test` ([probe tests](../../tooling/verification/checks.test.ts))                                                       |
| Shared components expose no escape hatches                            | `vp run @merit/ui#test`, `@merit/forms#test`, `@merit/tables#test` ([public contract](../../foundation/ui/src/public-contract.test.tsx)) |
| Notice controls sit in its `actions`                                  | `vp run test:stories` ([Storybook preview](../../tooling/storybook/.storybook/preview.tsx))                                              |
| One labelled action per page header                                   | `vp run test:stories` ([Storybook preview](../../tooling/storybook/.storybook/preview.tsx))                                              |
| Feature CSS leaves type and color to the UI                           | `vp run check:css` ([stylelint config](../../stylelint.config.mjs), [probe tests](../../tooling/verification/checks.test.ts))            |
| Documentation links, headings, agent budgets, review-config alignment | `vp run check:docs`, `vp run test:docs`, `vp run test:ci` ([verification record](../../tooling/verification/verification-record.ts))     |
| Secret scanning and dependency advisories                             | `vp run check:security` ([secrets config](../../tooling/verification/secrets.config.ts))                                                 |
| Applied migrations & destructive git guards                           | [Claude harness hooks](../../.claude/settings.json) & `vp run test:hooks`                                                                |
| Autonomous `agent:pr` protected-path & migration policy               | `node tooling/verification/agent-policy.ts` ([CI check](../../tooling/verification/agent-policy.ts)) & `vp run test:ci`                  |
| Single-behavior tests, UI parity, benchmarks                          | Prose/review ([testing](testing.md), [UI verification](ui-verification.md), [verification](verification.md))                             |
