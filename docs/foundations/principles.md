# Engineering principles

These principles guide how contributors design, write, verify, debug, and evolve
Merit. [Strategy](strategy.md) defines product direction,
[experience principles](experience.md) define user-facing qualities, and
[architecture](architecture.md) defines system ownership and boundaries; these
engineering principles govern day-to-day technical judgment across all layers.

Each principle names when it applies, where to keep it simple, and the sign that
it was skipped. [AGENTS.md](../../AGENTS.md#engineering-principles) pairs them
with what enforces each rule in code and CI.

## Design and structure

### Model the domain

**Encode domain states and rules in a dedicated structure so illegal states
cannot be constructed.**

Reach for a discriminated union, state machine, typed registry, or capability
`business` rule instead of scattered flags or repeated conditionals across
controllers and views.

- **When:** Adding stateful logic, status flags, or conditionals repeated across files.
- **Don’t force it:** Keep boring conditionals inline when logic is local, clear, and unlikely to grow.
- **Sign you skipped it:** Adding a second boolean that must stay in sync with the first, or checking the same rule in both a view and a handler.
- **Details:** [Model grant work explicitly](architecture.md#model-grant-work-explicitly).

### Match the best precedent

**Reuse and extend the strongest precedent; compare two distinct shapes before
writing code when no precedent fits or ownership changes.**

Most poor changes come from ignoring an established example or locking onto the
first shape that compiles when a boundary is new.

- **When:** Starting a feature, introducing a pattern, or crossing capability boundaries.
- **Don’t force it:** Small edits inside an established screen, command, or suite.
- **Sign you skipped it:** Copying a component or helper locally instead of extending a shared one, or needing follow-up refactors to move ownership.
- **Details:** [Build a feature](../../.agents/skills/build-feature/SKILL.md#1-ground-the-request) and [design boundaries around behavior](architecture.md#design-boundaries-around-behavior).

### Subtract before you add

**Remove dead weight first, then migrate callers and delete legacy APIs in the
same wave.**

Build new behavior on a simplified base rather than routing around obsolete
adapters, unused flags, or parallel old-and-new paths.

- **When:** Replacing an API, schema, UI pattern, or workflow.
- **Don’t force it:** External MCP or persisted database contracts that carry real backward-compatibility obligations.
- **Sign you skipped it:** Keeping `legacy*` wrappers, preserving compatibility shims between internal modules, or triggering `vp run code-health` dead-code findings.

### Minimize reader load

**Keep each function at one level of abstraction, collapse one-caller
pass-throughs, and shrink mutable scope.**

A reader should be able to answer where a value comes from and what can change
it without tracing through forwarding layers or hidden state.

- **When:** Shaping commands, controllers, hooks, or reviewing indirection.
- **Don’t force it:** Extractions that hide genuine transaction, storage, or draft-lifecycle complexity from callers.
- **Sign you skipped it:** Jumping through three single-caller helpers to follow one operation, or syncing state that could be derived.
- **Details:** [Keep functions at a coherent level of abstraction](../guides/coding-conventions.md#keep-functions-at-a-coherent-level-of-abstraction).

## Code, types, and concurrency

### Validate at boundaries

**Parse untrusted data once at system boundaries into domain types, and model
internal invariants constructively instead of silencing checks.**

Prefer discriminated unions, non-empty tuple or helper contracts, and `satisfies`
over `!` non-null assertions, `as` casts, `any`, or lint suppressions.

- **When:** Reading HTTP, MCP, route, JSON, or database inputs, or handling optional fields.
- **Don’t force it:** Exhaustive narrowings TypeScript already proves, or test fixtures asserting compile-time errors with `@ts-expect-error` and an explanation.
- **Sign you skipped it:** Writing `rows[0]!`, `.at(-1)!`, `as Exclude<...>`, or `oxlint-disable` to silence a correctness rule.
- **Details:** [Readability and safety](../guides/coding-conventions.md#readability-and-safety).

### Make operations idempotent

**Converge retries after partial failures on the same end state, and eliminate
shared mutable state before adding serialization.**

Separate files, rows, locks, and worktrees by owner first so concurrent actors do
not contend; serialize explicitly only where a domain invariant requires one
writer.

- **When:** Implementing `commandId` retries, setup scripts, migrations, locks, or concurrent tests.
- **Don’t force it:** Pure single-shot computations with no external side effects or concurrency.
- **Sign you skipped it:** A setup script reusing a half-extracted directory, a retry duplicating rows, or concurrent runs colliding on shared state.
- **Details:** [Consistent changes and recovery](architecture.md#consistent-changes-and-recovery).

### Sequence small, verifiable units

**Land the smallest complete change in ordered steps that each end in a passing
check.**

Keep unrelated cleanups separate, put failing regression tests or deletions
ahead of fixes and rewrites when ordering clarifies the diff, and omit
speculative generality.

- **When:** Multi-step fixes, refactors, migrations, or stacking commits.
- **Don’t force it:** Splitting tightly coupled edits when separation hides whether the combined behavior works.
- **Sign you skipped it:** One commit mixing dead-code deletion, refactoring, and behavior changes, or speculative options nobody requested.
- **Details:** [Commit changes](../guides/development.md#commit-changes).

## Verification and debugging

### Verify behavior at the owning layer

**Assert observable outcomes once at the lowest layer that owns the rule.**

Test what callers and users observe rather than private helper calls, and repeat
a scenario at a higher layer only when it catches a failure mode the lower layer
cannot observe.

- **When:** Writing, moving, or reviewing unit, integration, component, or browser tests.
- **Don’t force it:** High-consequence invariants—tenant isolation, authorization, money, and audit history—that warrant boundary assertions as well.
- **Sign you skipped it:** Browser or component suites repeating pure domain permutations, or assertions that still pass when you mutate the rule.
- **Details:** [Choose the owning layer](../guides/testing.md#choose-the-owning-layer) and [focused mutation checks](../guides/testing.md#focused-mutation-checks).

### Prove it on the real surface

**Verify changes and behavioral review findings against the real artifact, not
proxies or code reading alone.**

Inspect rendered Storybook and browser screenshots side by side for UI, run
PostgreSQL integration tests for persistence, and back behavioral review claims
with executed repro output.

- **When:** Finishing a change, claiming a fix, or reporting a non-style bug in review.
- **Don’t force it:** Pure domain logic with no UI or I/O surface, where package tests and mutation checks are the real surface.
- **Sign you skipped it:** Reporting UI work without opening screenshots, claiming a bug fix without reproducing first, or filing speculative behavioral findings without running code.
- **Details:** [Verify interface changes](../guides/ui-verification.md#verification) and [integration and runtime checks](../guides/verification.md#integration-and-runtime-checks).

### Fix root causes

**Reproduce on the failing surface and trace to the first wrong step; after two
failed fixes sharing one assumption, stop and test that assumption directly.**

A defensive guard is a fix only when the state it handles is legitimate;
otherwise it hides the upstream bug.

- **When:** Debugging failures, investigating regressions, or when repeated fixes fail the same gate.
- **Don’t force it:** Handling legitimate boundary conditions such as stale revisions or missing client addresses.
- **Sign you skipped it:** Adding sleeps or retries to quiet a flaky test, or writing a third workaround after two attempts failed CI.
- **Details:** [Diagnose a failure](../../.agents/skills/diagnose/SKILL.md).

### Explain the number

**Vet performance claims with the limiter, matched production conditions,
interleaved runs, correctness checks, and end-to-end impact.**

Never treat a single synthetic timing or profiled run as proof of a speedup or
regression.

- **When:** Reporting or acting on any latency, query-plan, bundle, or throughput measurement.
- **Don’t force it:** Quick exploratory timings explicitly labeled as single, unvetted observations.
- **Sign you skipped it:** Reporting _"7.9 ms to 3.9 ms"_ from one run without variance, the limiting factor, or route-level impact.
- **Details:** [Performance](architecture.md#performance) and [performance verification](../guides/verification.md#performance-verification).

## Learning and stewardship

### Encode repeat fixes in structure

**Escalate recurring mistakes from prose into architecture, types, lint, CI, or
tests—and prove the new check fails on the past mistake.**

Instructions in guides and review checklists are the fallback for judgment calls
that tooling cannot decide; retire prose warnings once structural checks catch
them.

- **When:** A contributor or review repeats the same mistake class twice.
- **Don’t force it:** Visual hierarchy, copy tone, and domain modeling judgment that static checks cannot decide.
- **Sign you skipped it:** Adding another paragraph to a review checklist or fixing the same test or documentation defect in repeated cleanup PRs.
- **Details:** [Rule enforcement](../../AGENTS.md#rule-enforcement).
