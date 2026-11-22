# Change review rubric

Review a change as someone who did not write it. You receive the brief, the base
branch, and (for UI changes) a screenshot directory. Find where the change is
worse than the codebase it joins, and say how to fix it. Do not modify the
repository.

## How to review

1. Read the brief and every named precedent in full (screen/story, controller,
   operation, tests). If a better-built precedent exists for similar records or
   actions, report it.
2. Read every changed file in `git diff <base>...HEAD` in full, not only hunks.
   Run `vpx tooling/verification/architecture/mechanisms.ts --base <base>` and
   check the diff against every matched mechanism's `invariants`, `docs`, and
   `decisions`.
3. For UI changes, take your own side-by-side desktop and narrow screenshots of
   the changed UI and its precedent following
   [UI verification](../../../docs/guides/ui-verification.md#verification) and
   [build.md](build.md#compare-the-ui), and inspect each pair before answering.
4. Report only concrete problems with: rubric section, file and line (or
   screenshot path), the precedent, guide, or invariant departed from, and a
   concrete fix. Do not report style preferences linters enforce.
5. End with coverage evidence: precedents read, `mechanisms.ts` output checked,
   screenshot pairs compared (when UI changed), and what was verified sound in
   each section. A review with no findings is incomplete without this evidence.

## Behavior and scope

- Does the change deliver everything under **Behavior** (or **Intended
  behavior**) and touch nothing under **Out of scope**?
- Does every changed file sit inside the brief's **Plan**, with every departure
  from a precedent listed under **Departures**?
- Are empty, long, missing, failed, conflicting, authorization, and read-only
  states handled as the brief and precedent handle them?
- For bug or security fixes, does the change fix the first wrong step rather
  than a symptom, and cover every caller and transport (web and MCP)?

## Reuse and simplification

- For every new component, hook, helper, style, fixture, or test helper, did you
  search by name and behavior to confirm no existing one does the job?
- Where a shared piece nearly fitted, was it extended rather than copied locally,
  and are new shared pieces placed where the next change will find them?
- Is each new abstraction justified by more than one real use or an explicit
  requirement? For refactors, is the result genuinely simpler rather than moved
  indirection, with no dead code or scaffolding left behind?

## Architecture and invariants

Standard: [architecture](../../../docs/foundations/architecture.md#design-principles),
[web features](../../../docs/guides/web-features.md#choose-the-owning-layer),
and [coding conventions](../../../docs/guides/coding-conventions.md).

- Does each business rule live in the capability's `business` package, and each
  file in its owning layer (views, controllers, data, interface server code)?
- Do domain terms match [domain concepts](../../../docs/domain/concepts.md)
  consistently across UI, MCP, and code?
- Does the diff satisfy every matched mechanism's `invariants` and owning docs
  from `mechanisms.ts` (including schema/migration SQL, authorization/tenant
  scope, drafts/recovery, MCP parity, and analytics sanitization when touched)?
- Does each function stay at one level of abstraction along a clear main path?

## Tests

Standard: [testing](../../../docs/guides/testing.md).

- Does each rule have a test at the lowest layer that can observe it, asserting
  outcomes rather than internal calls, without weakening existing guarantees or
  coverage policy?
- Would each test fail if the rule broke? Run a
  [focused mutation check](../../../docs/guides/testing.md#focused-mutation-checks)
  on consequential rules (auth, tenant scope, money, audit, concurrency).
- Is any overlap across layers justified per the testing guide, and do async or
  browser tests wait on observable readiness instead of fixed delays?

## UI (when UI changes)

Standard: [UI development](../../../docs/guides/ui.md),
[UI verification](../../../docs/guides/ui-verification.md#verification),
[experience principles](../../../docs/foundations/experience.md), and
[interface copy](../../../docs/guides/interface-copy.md).

- Side by side with its precedent, does the UI match hierarchy, typography,
  density, spacing, alignment, framing, and shared patterns on desktop and
  narrow widths, with keyboard focus and long/missing content handled cleanly?
- Are redundant controls removed while keeping consequences, recovery states,
  and historical basis clear before acting?
