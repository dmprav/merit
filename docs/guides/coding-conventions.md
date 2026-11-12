# Coding conventions

Use these conventions when writing or reviewing code. The [architecture](../foundations/architecture.md)
defines responsibilities and dependencies; [verification](verification.md)
explains how to run the checks.

## Keep functions at a coherent level of abstraction

Express one activity through steps at a comparable level of meaning. A business
command coordinates authorization, current facts, a domain decision, and recording
the result. Its reader should not need to understand stored JSON fields or audit
table columns to follow that operation. A view presents workflow state and invokes
actions without reconstructing commands, revision baselines, or cache effects.

Extract a responsibility when its name explains a meaningful step and its interface
hides knowledge from the caller. Ordinary guards and simple expressions can remain
inline. Keep private helpers local until a separate module makes ownership clearer.
Lint limits functions to 80 code lines, with 100 allowed in JSX and TSX files
to accommodate markup. The file-based allowance also applies to hooks and helpers
in those files.
Treat that ceiling as a prompt to identify responsibilities: a short function that
requires callers to coordinate its internals still leaves the responsibility scattered.

Use these implementations as references:

| Responsibility                                                                                           | Caller expresses                                                                  | Implementation owns                                                                                |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Intake recording](../../capabilities/applications/business/src/server/persistence/commands/intake.ts)   | Record an accepted application change in the current transaction.                 | Stored encoding, unchanged-record detection, material and draft writes, and history construction.  |
| [Intake decisions](../../capabilities/applications/business/src/domain/intake.ts)                        | Prepare a requested change from current facts.                                    | Eligibility, source-version transitions, and the action and reason recorded in history.            |
| [Admin editing](../../interfaces/admin/src/features/organizations/controllers/organization.ts)           | Save a name, propose or confirm a recipient replacement, revoke, or retry a read. | Draft lifecycle, confirmation state, typed failures, and committed-write recovery.                 |
| [Admin data](../../interfaces/admin/src/features/organizations/data/organization.ts)                     | Read or change an organization.                                                   | Concrete transport, query keys, cancellation, cache updates, and refresh effects.                  |
| [Review persistence](../../capabilities/reviews/business/src/server/persistence/commands/reviews.ts)     | Load current review facts in the supplied transaction.                            | Validation and decoding of stored review and criteria projections and material version references. |
| [Invitation issuance](../../capabilities/organizations/business/src/server/commands/issue-invitation.ts) | Issue an invitation for provisioning or specified team responsibilities.          | Delivery limits, complete record construction, token generation, expiry, and insertion.            |
| [Contact drafts](../../capabilities/contacts/web/src/controllers/drafts.tsx)                             | Find or update a draft for a workspace and contact.                               | Storage keys and shared or standalone draft state.                                                 |

For example, an intake command that decodes a snapshot, constructs before/after
history rows, and writes each table makes storage choices part of the workflow.
The reference command instead receives a typed application, evaluates the change,
and calls `recordIntakeChange` with that result. The command still owns its
transaction and lock order. Similarly, an invitation button calls `resend`; the
view does not assemble a server request or invalidate queries.

When improving an existing workflow, trace its callers and verification before
choosing an extraction. Identify the knowledge that is exposed, its intended owner,
and a plausible future change that should become local. Prioritize consequential
rules and frequently changed workflows. Complete one responsibility through its
callers, tests, and documentation before expanding to another.

Review the result using these questions:

- Can the reader follow the operation without understanding storage or transport details?
- Does each rule have an identifiable owner, and what knowledge has the caller shed?
- Are authorization, transaction ownership, retries, and failure obligations explicit?
- Would the proposed future change stay with its owner?
- Do tests establish domain outcomes, transactional guarantees, and user recovery?

Reuse an abstraction when meaning and failure behavior are shared. Similar syntax
alone does not establish that two workflows should have the same implementation.
Verify behavior through the owning interfaces; avoid assertions about the sequence
of private helper calls. Add architectural import checks for enforceable ownership
rules, while reviewing abstraction level as a design decision.

### Check function size

The [lint policy](../../tooling/verification/lint.ts) enforces
`max-lines-per-function` at 80 lines across production TypeScript and JavaScript,
with a 100-line allowance for all functions in JSX and TSX files. Keep logic in
focused hooks and helpers even where that file-based allowance applies.
Blank lines and comment-only lines do not count;
nested functions and JSX remain part of their enclosing function's length.
Immediately invoked functions are checked too. Generated code, tests, stories,
fixtures, mocks, and verification tooling are excluded from this size rule.

Run `vp run check:code` to enforce the limit. Extract meaningful responsibilities
into local helpers, components, or hooks while preserving state lifetimes, failure
handling, and verification. Keep readable formatting and explanations; shortening
the text alone does not improve the responsibility's design. A controller whose named
actions share one state lifetime may keep those actions as local closures. Use a
local, explained function-length exception when extracting them would only expose
its state setters; retain the complexity check and behavior tests.

### Check function complexity

Run `vp run check:complexity` to check production TypeScript and JavaScript,
including React components. Fallow limits cognitive complexity to 15 and
cyclomatic complexity to 20. Cognitive complexity highlights branching and
nesting that make a function harder to follow; cyclomatic complexity counts
independent control-flow paths. These are review triggers, not design goals:
extract a meaningful responsibility, simplify repeated decisions, or flatten
control flow while preserving the behavior and its verification.

The [Fallow configuration](../../.fallowrc.jsonc) owns these limits. Generated
code, tests, stories, fixtures, mocks, and verification tooling are excluded from
this production check; their existing lint and test requirements still apply.
Function length, file length, parameter count, and coverage-derived risk scores
do not determine whether this check passes.

When a cohesive function is clearer with its decisions together, use an exact
file and named function in `health.thresholdOverrides`, a numeric ceiling for
each exceeded metric, and a reason explaining the responsibility that should
remain together. Keep the ceiling at the reviewed score so further growth is
reported. Name a callback before giving it an exception: an anonymous-function
name could match other callbacks in the same file. Do not raise global limits,
ignore a production directory, or suppress complexity inline to clear a finding.
Revisit the exception when changing that responsibility, lower its ceiling after
simplification, and remove it when the ordinary limits apply. Fallow's JSON
report includes the status of configured exceptions, including stale or unmatched
entries.

## Readability and safety

Oxfmt owns indentation, quotes, line wrapping, and import sorting. Keep related short
constants together; separate functions, independent type declarations, CSS rules,
and media sections with a blank line.

Inside function bodies, use blank lines as paragraph breaks when the purpose
changes: reading data, validating it, calculating a result, persisting changes,
and preparing the response. Keep a lookup with its immediate guard and related
validation checks together. Separate component setup from rendering, and group
test setup, actions, and assertions into readable steps. Leave short, cohesive
functions compact; each statement does not need its own paragraph. The formatter
preserves these breaks, while their placement remains a matter of judgment.

Use braces for control flow, `const` for values that are not reassigned, and
type-only imports for types. Strict equality is the default; `value == null`
remains a supported way to test for either `null` or `undefined`.

Type checking treats indexed array and dictionary values as possibly absent and
checks missing return paths. Lint checks hook usage and dependencies, promise
misuse, unsafe operations on `any`, and unhandled union cases in switches. A
switch may intentionally handle remaining cases with a meaningful default.
Validate untrusted input, narrow optional values, and make failure behavior
explicit; casts, non-null assertions, and `void` do not establish those guarantees.

JSX callbacks may perform asynchronous work and own its pending and error state.
React does not await them, so they must handle failures themselves. The promise
rule permits these callbacks while checking misuse in ordinary callbacks,
conditions, and spreads; floating-promise checks remain enabled. Accessibility
lint complements browser checks of keyboard interaction, focus, and shared controls.
A delegated event on a wrapper around real links can have a local exception with
an explanation; it does not make the wrapper another interactive control.

Test lint accepts assertion helpers, custom fixtures, optional-state assertions,
and Vitest assertion messages. The test runners reject focused `.only` tests,
including local verification. SQL results have explicit row types, and fixtures
assert required values at runtime instead of assuming that an array entry exists.

The root [Vite configuration](../../vite.config.ts) and
[CSS configuration](../../stylelint.config.mjs) own the rules. Run
`vp check --fix --deny-warnings` for TypeScript formatting and safe lint fixes;
run `vp run check:css -- --fix` for CSS fixes, followed by `vp fmt`.
Review fixes that affect behavior and run the affected tests.

For a dependency finding, use the [architecture](../foundations/architecture.md)
to check ownership and move the dependency or behavior to the appropriate place.
Remove unused code and correct dependency declarations. When a framework loads
code implicitly, declare its entry point in the checker configuration; keep any
necessary exception narrow and explain why it exists.
