# Verify a change

Run commands from the repository root after [local setup](development.md).
Use this guide to choose and run checks; [testing guidance](testing.md) explains
test design and the coverage policy, and [UI verification](ui-verification.md)
covers interaction and visual review. To change check configuration, orchestration,
or regression tests, use [verification tooling](verification-tooling.md).

## Verification

Choose the smallest set of checks that covers the changed behavior and affected
boundaries. For ordinary tasks, targeted verification is sufficient: contributor
documentation needs the documentation link check; business rules need the owning
package's tests and applicable coverage; persistence and permissions need relevant
integration tests; interface changes need checks of the affected interaction and
rendered behavior. Use the [commands below](#while-developing) and the
[test guidance](testing.md) to select those checks.

Stop once the applicable checks pass. Reuse passing results while their relevant
source, dependencies, configuration, and runtime conditions remain unchanged.
Repeat or broaden checks when subsequent edits, failures, or unresolved risks
justify it. Report the checks performed and any remaining verification gaps.
In a pull request, mention only checks CI doesn't run, such as a manual mutation
check, and the gaps; the required `verify` check reports the rest.

Run full workspace verification with `vp run ready` before merging or releasing
completed changes, when explicitly requested, or when a change has broad effects
that targeted checks cannot adequately cover. The
[PR workflow](../../.github/workflows/verify.yml) runs every check and suite in
`ready` with `--no-cache` across parallel, sharded Ubuntu jobs for pull requests
targeting `main`, or a targeted documentation and secrets subset when a pull request
changes only documentation files. Its `verify` check
is required by the [branch rules](development.md#branch-protection); pending or
failed verification blocks merging. A passing run on the current PR commit
satisfies the required PR gate while its inputs remain unchanged.
Targeted checks can defer discovery of unrelated regressions to that milestone.
All existing suites and coverage thresholds remain part of full verification.

For a full run, start PostgreSQL and Mailpit (`docker compose up -d --wait`).
`vp run ready` checks documentation links and their regression
tests, builds the application, and checks formatting, TypeScript and CSS lint,
independent capability types, dependency boundaries, unused code, and production
function complexity. It also runs tests (including core coverage checks and all Storybook stories), checks migration
metadata, scans for secrets and dependency advisories, and verifies representative
browser flows. Install the browsers once with
`pnpm --filter @merit/test-support exec playwright install chromium firefox webkit`.

Every check in a full run is required, and any failed task makes `ready` fail.

Successful builds, package tests, and static checks can reuse results through
[Vite+ input tracking](https://viteplus.dev/guide/automatic-data-tracking).
Source, configuration, dependency, and directory changes invalidate the affected
task; this includes newly added files.

Security checks, database integration, browser checks, and tooling regression tests
always execute when selected. Use `vp run --no-cache ready` when a fresh run of
every check is needed, and `vp run --last-details` to inspect cache hits and misses.
Run cached checks through
`vp run`; calling a tool directly, such as `vp check`, bypasses task caching.
In environments where an inherited seccomp user-notify listener blocks Vite
Task file tracking with `EBUSY` (such as WSL2 or sandboxed runners), set
`MERIT_TASK_CACHE=off` to disable task caching globally.

### While developing

The ordinary browser commands use desktop Chromium for targeted checks.
Use the additional browser projects when the changed behavior calls for
[compatibility checks](#browser-compatibility). The `:all` variants and `ready`
include the full matrix for the [full verification milestones](#verification).

Choose checks for the part you changed:

| When you need to…                                                    | Run…                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Check formatting, lint, and types                                    | `vp run check:code` (build first to generate route and Worker types)  |
| Check capability packages without application-generated types        | `vp run -r typecheck`                                                 |
| Typecheck one extracted web capability                               | `vp run @merit/grantmaking-web#typecheck`                             |
| Check CSS correctness and spacing                                    | `vp run check:css`                                                    |
| Check local documentation links and heading anchors                  | `vp run check:docs`                                                   |
| Check dependency boundaries after moving code or changing imports    | `vp run architecture`                                                 |
| Check for unused code and incorrect dependency declarations          | `vp run code-health`                                                  |
| Check production function complexity                                 | `vp run check:complexity`                                             |
| Scan repository files for secrets and audit dependencies             | `vp run check:security`                                               |
| Run package tests                                                    | `vp run -r test`, or `vp run <package>#test` for the affected package |
| Check all stories, their interactions, and accessibility             | `vp run test:stories`                                                 |
| Check Storybook layouts and visual baselines without the application | `vp run test:browser:stories`                                         |
| Check application flows                                              | `vp run test:browser:app`                                             |
| Check shared browser fixtures without starting a server              | `vp run test:browser:tooling`                                         |
| Run shared browser checks, Storybook, and application flows          | `vp run test:browser`                                                 |
| Build the workspace                                                  | `vp run -r build`                                                     |
| Check database integration                                           | `vp run @merit/app#test:integration`                                  |
| Check persisted workspace navigation without Clerk                   | `vp run @merit/app#test:workspace`                                    |

The application owns the browser compilation: `app/tsconfig.json` includes
product, site, and admin source and the generated router/Worker context. Their
adapters are checked by `vp run @merit/app#build`; do not restore reverse source
includes or independent interface TypeScript projects. Each capability web package
has its own `typecheck` task with no application source. `vp run ready` runs both
the assembled build and these independent checks.

The pre-commit hook fixes and checks staged files, including CSS, runs the
architecture check, and scans staged changes for secrets. CSS fixes run before
formatting so the two tools do not write the same file concurrently. Full
verification includes the CSS and check-configuration tests; no separate editor
setup is required.

The commit-msg hook separately validates [commit conventions](development.md#commit-changes).
Use `vp run check:commit /path/to/commit-message.txt` to check a draft message.

## Security checks

`vp run check:security` runs secret scanning and dependency auditing and is required
by `ready`. Both checks always execute: the Git index and advisory registry can
change independently of tracked source. Security lint rules run with `check:code`
and staged-file linting: they reject raw HTML injection, script URLs (including
the shared `Link` component), and unsafe iframe sandboxing.

| Scope                                        | Command                        |
| -------------------------------------------- | ------------------------------ |
| Current repository files                     | `vp run check:secrets`         |
| Staged changes, as the commit hook sees them | `vp run check:secrets:staged`  |
| Every file version in local Git history      | `vp run check:secrets:history` |
| Known dependency vulnerabilities             | `vp run check:dependencies`    |

The current-file scan includes tracked files and new files not ignored by Git.
It excludes ignored local credentials and generated output, but still checks
force-added ignored files. The staged scan checks the index, including the first
commit; changing a working copy does not hide a staged secret. Run the history
scan when adopting the check in an existing repository or investigating a leak.
Full verification checks current files; it does not rescan all history.

Secretlint runs locally, never contacts providers, and masks findings. The staged
scan checks the full staged content of each added or modified file. The history
scan checks every file version reachable from local refs and labels findings with
their blob; `git log --all --find-object=<blob>` lists the commits that contain one.
Binary files are skipped. GitHub secret scanning and push protection cover the
remote side.

If it reports a real credential, revoke or rotate it and remove it from source;
deleting the current line does not remove earlier commits. Review false positives
individually and record exceptions as exact values in
[the scanner configuration](../../tooling/verification/secrets.config.ts). Keep
provider rules enabled and avoid excluding entire source or test directories.

The dependency audit includes production and development dependencies. High and
critical advisories fail the check; registry failures also fail it. Run
`pnpm audit` to review lower-severity findings. Prefer a supported dependency
update or a targeted override, verify affected behavior, and document any
accepted advisory exception with its scope and reason. The audit does not apply
fixes automatically. These checks complement authorization and tenant-isolation
tests; they do not establish the correctness of access policy.

## Browser compatibility

The [browser-support policy](../foundations/architecture.md#browser-support)
defines the supported browsers and how to choose platform features. For a change
to browser APIs, shared interactions, or responsive layout, verify the affected
behavior across that set, including mobile input and scrolling where relevant.
Exercise the base behavior as well as any optional enhancement or fallback.

The shared [browser projects](../../tooling/testing/browser/config.ts) retain the complete
matrix for Storybook, the public application, and persisted workspaces:

| Projects            | Coverage                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ |
| `desktop`           | Full suites in desktop Chromium, including visual baselines; the short-loop default. |
| `mobile`            | Full suites in mobile Chromium, including visual baselines.                          |
| `firefox`, `webkit` | Representative `@cross-browser` checks at desktop width.                             |
| `webkit-mobile`     | The same representative checks with a narrow, touch viewport.                        |

The selected checks cover navigation, drafts, saving and reloading, conflicting
edits, access recovery, responsive tables, enlarged text, confirmation retry, and
browser-error reporting. They reuse the same assertions as the full Chromium
suites. Tag representative tests with `@cross-browser` when extending this
coverage. Use the project's `isMobile` setting for input-mode branches so a test
works with each browser project's name. Visual comparisons stay in Chromium.

At the [full verification milestones](#verification), `vp run ready` runs all five
projects for Storybook, both application suites, and the shared browser fixtures.
To run just the browser checks across the full matrix:

```sh
vp run test:browser:all
vp run @merit/app#test:workspace:all
```

Use `test:browser:stories:all`, `test:browser:app:all`, or `test:browser:tooling:all`
for one suite. For a
focused run of the representative checks across all five projects:

```sh
vp run test:browser:stories:all --grep @cross-browser
vp run test:browser:app:all --grep @cross-browser
vp run @merit/app#test:workspace:all --grep @cross-browser
```

Append `--project mobile`, `--project firefox`, `--project webkit`, or
`--project webkit-mobile` to a single-suite `:all` command to focus on one additional project.
The installed engines follow the locked Playwright version; repeat the
installation command after upgrading it. These
engine checks do not establish compatibility with every current branded release
or a physical device. Check Chrome, Edge, Firefox, and Safari releases and real
devices where behavior depends on them, including Safari on iOS. Record the
browsers and versions, exercised behavior, results, and any gaps in the change's
verification notes. Follow the [UI checks](ui-verification.md#verification) for accessibility
and interaction details.

Playwright is temporarily pinned to 1.64.1 because 1.65.0's Firefox crashes when
accessible-name queries and accessibility scans read the same ARIA references
([upstream issue](https://github.com/microsoft/playwright/issues/43967)). Remove
the pin when a stable release includes the Firefox fix, reinstall the browsers,
and run all three suites. Keep the accessibility assertions enabled.

## Performance verification

Use a production build and representative data volumes to assess loading,
navigation, and interactions. Record the scenario, browser, device or throttling
conditions, data size, and measurements so comparisons are reproducible. Set a
budget from the workflow's needs and measured behavior, then verify it when the
relevant loading, query, or rendering path changes.

Distinguish input delay, event processing, and rendering from the time a server
operation takes to complete. Trace the slow part before choosing an optimization,
and compare the same scenario before and after the change. Include the effect on
loaded code and work moved to another stage; a faster initial screen must still
leave subsequent interaction usable. See the
[performance responsibilities](../foundations/architecture.md#performance) when
choosing where a change belongs.

## Integration and runtime checks

Integration tests create and remove isolated PostgreSQL databases. Set
`TEST_DATABASE_URL` for another test server; use a dedicated development server
where the test role may create databases.

Build the application before running integration tests. They substitute identities to
exercise persisted operations and access; browser workspace checks use local mode
with an isolated test database. See the [database](testing.md#database-fixtures) and
[browser fixture guidance](testing.md#browser-fixtures) when adding tests.

Keep the workspace suite on one worker because its application server
uses the same database throughout the run. Run it through the application command so the
fixture receives the disposable database address; for example,
`vp run @merit/app#test:workspace --repeat-each=2` checks desktop Chromium
repeatability; use `test:workspace:all` for the complete matrix. Check live web sign-in and sign-out
after configuring Clerk; fixture checks do not verify Clerk sessions. Follow [MCP verification](mcp-operations.md#verify-the-connection)
for delegated access, and [UI checks](ui-verification.md#verification) for component behavior
and browser review.

With the app running in ordinary mode (`vp run dev`), `vp run @merit/app#smoke` checks public web access and removal of anonymous MCP
and verifies that unauthenticated workspace requests return no tenant data. Run
it against the [production preview](deployment.md#build-and-preview) as well; set `MERIT_BASE_URL`
when testing a different port or a deployed instance.
