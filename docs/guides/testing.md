# Write and maintain tests

Choose tests around the behavior a change must preserve. For commands, browser
setup, and database test execution, use [verification](verification.md).
For interactive examples, use [Storybook](storybook.md).

## Test behavior

Give each focused test one business behavior to explain, with its own setup and
assertions about the outcome. Several assertions can establish one behavior, such
as a rejected edit leaving both the record and its history unchanged. Keep longer
journeys for representative acceptance checks; unrelated rules should fail
independently.

Test the current contract. After replacing a screen, endpoint, or storage format,
remove assertions whose only purpose is to name the discarded implementation.
Keep negative assertions when they protect a current rule, such as rejecting
unauthorized writes or excluding staff judgments from application material. State
that rule in the test name and use current inputs. Preserve the agreed guarantees
and follow the [coverage policy](#coverage-policy-changes) when removing protection.

Check internal collaborations through their results; outgoing effects such as
invitation delivery have observable recipients and content worth asserting.

Keep protocol validation and response formatting in fast adapter tests. Verify
command translation through real operations and persisted outcomes, including
the caller's revision and authenticated authorship, rather than internal method
names or call counts. The [MCP contract tests](../../interfaces/mcp/src/app/server.test.ts)
and [persisted intake command tests](../../app/tests/mcp-intake.integration.ts) exercise
these boundaries separately. Identity-unavailable checks that substitute all
services belong in adapter suites and need no database setup.

## Choose the owning layer

**Verify each behavior at the lowest layer that can observe its outcome, in the
package that owns the rule.** Another copy of the same scenario adds run time and
another place to update when the rule changes, without adding evidence. Higher
layers check that the parts connect rather than repeating rule variations.

| Layer                                     | Owns                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pure tests in the owning package          | Rule variations, validation, encoding, and formatting.                                    |
| Capability integration tests              | Persistence, transactions, retries, authorization, and tenant scope of its operations.    |
| Application integration tests             | Composition across capabilities, transports, identity modes, demo seeding, and email.     |
| Adapter tests (MCP, server functions)     | Protocol validation, response contracts, and error containment with substituted services. |
| Component tests (jsdom)                   | Rendered states, form logic, command payloads, failure and retry paths, controlled time.  |
| Browser tests (Storybook and application) | Real focus, layout, responsive and cross-browser interaction, and complete user flows.    |

A suite that composes another capability should assert what the composition adds.
For example, the contacts capability owns contact revisions, history, and access;
grantmaking tests check that applications resolve live contact details and that
outstanding review requests block archival.

### Justify overlapping coverage

**Repeat a scenario at another layer only when that layer can detect a failure the
lower one cannot.** Overlap is justified for:

- **Boundary translation:** an MCP command test confirms that the caller's revision
  and authenticated author reach the persisted outcome, although the capability
  owns the conflict rule.
- **Representative journeys:** the MCP grant-work journey and `@cross-browser`
  flows confirm that the parts connect; independent rules keep focused tests.
- **Different failure modes:** a component test injects a failed save and checks
  the retried command, while a browser test checks the same screen's real focus.
  Keep detailed timer checks in component tests with controlled time so browser
  checks do not repeat them through real waits.
- **Guarantees with severe regressions:** tenant isolation, authorization, money,
  and audit history can be asserted at both the service and transport boundaries.

Before removing a duplicate, confirm that a remaining test asserts each guarantee
it covered, and move any unique assertion to the owning layer. Name where each
behavior remains verified in the change description. Removing the only test of a
guarantee follows the [coverage policy](#coverage-policy-changes).

## Core test coverage

Coverage is an enforceable check for omitted execution paths in the business core.
It gives contributors, including coding agents, a clear completion condition.
Assertions must still establish the expected behavior: a fully executed schema
can leave required fields, limits, defaults, forbidden fields, or revision rules
unverified. Derive cases from the owning workflow and contract before reading the
implementation. Focus independent review on authorization, money, audit history,
concurrency, transactions, and changes to verification policy.

The package test commands require 100% line, branch, function, and statement
coverage for these source areas:

| Package                                                          | Measured behavior                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@merit/access`                                                  | Domain authorization policies and decisions                                        |
| `@merit/audit`                                                   | Event attribution and target formats, bounded history query and result formats     |
| `@merit/grantmaking`                                             | Domain rules, public API formats, example construction, and stored-record encoding |
| `@merit/rounds`, `@merit/applications`, `@merit/recommendations` | Owned domain rules, public API formats, and stored-record encoding                 |
| `@merit/reviews`                                                 | Review and participation rules and public API formats                              |
| `@merit/organizations`                                           | Domain rules and browser-safe API definitions                                      |
| `@merit/contacts`                                                | Domain validation and public command/query API formats                             |
| `@merit/money`                                                   | Exact monetary values, parsing, arithmetic, and formatting                         |
| `@merit/dates`                                                   | Calendar-date validation, parsing, and formatting                                  |

Run an affected package's full suite to check its coverage, for example:

```sh
vp run @merit/grantmaking#test
```

`vp run -r test` and `vp run ready` use those same commands, so ordinary coverage
checks do not require a second test run. For focused development, run
`vp test <test-file>` from the affected package directory, then finish with the
full package command.

The [shared coverage defaults](../../tooling/verification/coverage.ts) own the
provider, reports, and four 100% thresholds. Each package’s `vite.config.ts`
explicitly includes its measured source files,
including files no test imports. Tests and fixtures stay outside the measurement;
grantmaking also excludes its static example records while measuring example
construction and its private stored-record encoding. Business operations,
database queries and writes, UI, and application wiring remain verified by their
existing suites without coverage thresholds. Keep the V8 coverage provider version aligned with Vite+'s
Vitest version when upgrading the toolchain.

The [verification tests](../../tooling/verification/checks.test.ts) temporarily add an unimported
executable file to each measured source area. They group probes by package, assert
that all four thresholds remain at 100%, and run the package's normal test command
once without caching. The command must fail for uncovered code and report every
probe file with zero coverage. This checks the enforcement mechanism as well as
the configured scope. The probe files and their reports are removed afterward.

When coverage fails, inspect the uncovered behavior and add a focused test at the
owning boundary. Failure injection is appropriate when it establishes a meaningful
guarantee, such as propagating an unexpected error or leaving state unchanged.
Prefer real inputs and stable dependency boundaries; assess the refactoring cost
of replacing internal helpers solely to reach defensive branches.

Reports are generated even when tests fail. Open `coverage/index.html` inside the
package to inspect uncovered paths. The terminal prints a summary;
`coverage/coverage-summary.json` records total and covered counts. Reports are
local and ignored by Git. To regenerate them when a task is cached, use
`vp run --no-cache @merit/grantmaking#test`.

### Coverage policy changes

Feature work must satisfy the checks selected under the
[verification policy](verification.md#verification), including applicable package
coverage. Weakening those checks requires explicit user approval of the policy
change: lowering thresholds, narrowing measured production scope, adding
coverage-ignore directives, or removing or skipping
required tests or suites. Explain the behavior that would lose protection and
any replacement verification. A defensive-path exception must identify the
invariant that makes the path unreachable and how that assumption is checked.
Renames that preserve scope and test changes that preserve the agreed guarantees
remain routine implementation work.

A local check catches accidental policy drift; a contributor who can edit the
check can also weaken it. The PR workflow runs the same coverage checks, and its
required `verify` check blocks merging as described in
[branch protection](development.md#branch-protection). Policy changes still require
explicit owner review outside the coding agent's discretion. Passing CI does not
authorize weakening coverage, and the explicit user-approval rule remains a review
obligation rather than a tamper-resistant merge restriction.

This policy combines a narrow execution requirement with outcome-based review.
[Khorikov explains why coverage cannot establish test quality](https://enterprisecraftsmanship.com/files/Unit-Testing-Chapter-1-Excerpt.pdf);
[SQLite describes the additional evidence and cost behind exhaustive coverage](https://sqlite.org/testing.html).
The percentage alone is insufficient evidence of correctness.

## Focused mutation checks

Use a small mutation experiment when reviewing a consequential rule or evaluating
assertion strength. Work in a disposable copy so production sources and concurrent
work remain intact. Establish a passing baseline, deliberately change one rule,
and run its focused suite without coverage thresholds. Confirm that an assertion
about the changed behavior fails; a compilation error, timeout, or coverage failure
does not establish that the test detected the incorrect outcome.

Useful examples include changing all required authorization facts to any one fact,
reversing tenant equality, accepting amounts outside the supported monetary range,
and treating zero as negative. Restore each mutation before trying the next one.
For a surviving mutation, determine whether it changes observable behavior and
add a missing behavior test when warranted. Run the restored package's full
coverage suite afterward. Record the mutations, failed assertions, and survivors
in the change's verification notes. This is a focused review technique; there is
no project-wide mutation score requirement.

## Test data

### In-memory fixtures

Keep business-rule inputs focused on the behavior being checked. Small inputs can
stay inline; use typed factory functions when repeated setup obscures a test.
The funding-round [test helpers](../../capabilities/grantmaking/business/tests/fixtures.ts)
provide incomplete applications, empty rounds, individual assessments and requests,
and a reviewed-application scenario
without depending on demo content. Their defaults are deterministic and allocate
fresh nested data on each call. Overrides replace whole fields; callers supply
consistent versions, history, and related records when changing those fields.
Keep values that determine an assertion explicit in the test.
Other packages can import these in-memory factories from
`@merit/grantmaking/testing/fixtures`. Route, controller, and data tests should
construct the facts they need rather than select records by position from the demo
scenario.

Named fixtures remain useful for stable screen states shared by component tests
and stories. Treat shared fixture objects as immutable. Keep factories and
scenarios with their owning capability, and separate in-memory data construction
from database setup and cleanup. Add a factory library only when recurring needs
such as associations or composable variants justify its additional API.

Setup helpers establish preconditions and fail clearly when those cannot be met.
Keep checks of business behavior, such as retrying a command to verify idempotency,
in named tests so failures identify the rule being checked.

### Database fixtures

The shared [`databaseTest`](../../tooling/testing/database/database-test.ts) fixture, exported
from `@merit/test-support/database`, creates and
migrates one database per test file, disposes it after the file finishes, and
clears its data before each test. Tests using it must run sequentially within a
file. Compose scenario fixtures on top: the
[`workspaceTest`](../../capabilities/organizations/business/tests/workspace-test.ts)
setup, exported from `@merit/organizations/testing/workspace`, supplies two workspaces with
explicit memberships and no grant content. Tests create the rounds, applications,
and reviews they need. The [recommendation tests](../../capabilities/grantmaking/business/tests/recommendations.integration.ts)
build one round and two applications with known allocations, revisions, and audit
history. Use `seedExampleRounds` when the demo scenario itself is part of the
behavior being checked.

Business integration tests live with the capability or foundation library they
exercise. The application retains cross-capability, transport, identity-mode, demo,
and email integration. Shared database support lives in `tooling/testing/database`, outside
production exports and without a reverse dependency on capability test code.
The application integration task discovers both groups, preserving one command for
the complete persisted suite. Application suites separate demo seeding, workspace
access, and MCP intake, contacts, reviews, and team commands. The
[MCP grant-work journey](../../app/tests/mcp-workflow.integration.ts) retains a
representative complete flow; independent rules have their own setup and tests.
The capability-owned [round fixture](../../capabilities/grantmaking/business/tests/round-test.ts),
exported from `@merit/grantmaking/testing/rounds`, supplies explicit empty rounds
for storage and transport checks. Application-only
[transport fixtures](../../app/tests/fixtures/transport-test.ts) compose real
services and substitute the external session identity.

### Component test setup

Use `@merit/test-support/ui` for DOM matchers and React cleanup in jsdom tests.
Workspace UI suites use `@merit/test-support/ui/workspace`, which also supplies
IndexedDB, scroll and media-query substitutes, and clears draft and session storage
after unmounting React. Keep a one-line import in the package's setup file so its
TypeScript program includes the matcher declarations. The drafts library keeps
its own storage setup to test that foundation independently of the consumer harness.

jsdom projects share a 15-second
[component test timeout](../../tooling/testing/component-tests.ts) instead of Vitest's
5-second default. On CI, where package suites run in parallel, view journeys take about
three times as long as locally and reached the default. A test that times out keeps
running and can type into the next test's view, so one slow test can fail the rest of
its file. Look for the first timeout before investigating the others.

Run `vp run @merit/test-support#test` when changing shared component setup, along
with the affected consumers. Browser suites cover actual layout and responsive
behavior; the jsdom substitutes do not model them.

### Browser fixtures

Workspace browser specs use the shared
[`workspace-test` fixture](../../app/tests/browser/workspace-test.ts), which resets and seeds
the suite's isolated database before each test. Both application browser suites compose the shared
[`browser` fixture](../../tooling/testing/browser/checks.ts), exported from
`@merit/test-support/browser`, which fails on
unexpected console errors and uncaught exceptions across all pages, including
popups. Use its `newContext` fixture for additional isolated visitors so those
contexts receive the same checks and cleanup. Expected errors belong in explicit
assertions in the test that triggers them; layout and accessibility checks remain
explicit at settled screen states.

Calendar day buttons take their names from each engine's `Intl` date formatting,
whose locale data differs: WebKit on Linux names a day "Thursday 21 January 2027",
while Chromium and Firefox add a comma after the weekday. Locate days with
[`calendarDay`](../../tooling/testing/browser/calendar.ts) from
`@merit/test-support/browser/calendar` so cross-browser specs accept both forms.

Follow the [runtime prerequisites and execution guidance](verification.md#integration-and-runtime-checks)
when running these suites, including the workspace suite's single-worker requirement.
