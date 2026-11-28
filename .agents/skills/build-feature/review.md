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
3. For UI changes, capture desktop and mobile pairs of the changed UI and its
   precedent via `vp run ui:verify` ([drive-merit](../drive-merit/SKILL.md),
   [UI verification](../../../docs/guides/ui-verification.md#verification)), and
   inspect every pair before answering.
4. Report only concrete problems with: rubric section, file and line (or
   screenshot path), the precedent, guide, or invariant departed from, and a
   concrete fix. Do not report style preferences linters enforce.
5. End with coverage evidence: precedents read, `mechanisms.ts` output checked,
   screenshot pairs compared (when UI changed), and what was verified sound in
   each section. A review with no findings is incomplete without this evidence.

## Behavior and scope

- Does the change deliver all of **Behavior** and touch nothing **Out of scope**?
- Does every changed file sit inside the brief's **Plan**, and every departure
  from a precedent appear under **Departures**?
- Are empty, long, missing, failed, conflicting, unauthorized, and read-only
  states handled as the precedent does?
- For bug or security fixes, does it fix the first wrong step, not a symptom,
  across every caller and transport (web and MCP)?

## Reuse and simplification

- For every new component, hook, helper, style, or fixture, did a search by name
  and behavior confirm no existing one does the job?
- Was a nearly fitting shared piece extended rather than copied, and are new
  shared pieces where the next change will find them?
- Is each new abstraction justified by more than one real use or an explicit
  requirement? Are refactors simpler, not moved indirection, with no dead code?

## Architecture and invariants

Standard: [architecture](../../../docs/foundations/architecture.md#design-principles),
[web features](../../../docs/guides/web-features.md#choose-the-owning-layer),
and [coding conventions](../../../docs/guides/coding-conventions.md).

- Does each business rule live in the capability's `business` package, and each
  file in its owning layer?
- Do domain terms match [domain concepts](../../../docs/domain/concepts.md)
  across UI, MCP, and code?
- Does the diff satisfy every matched mechanism's `invariants` and owning docs
  from `mechanisms.ts` (including schema/migration SQL, authorization/tenant
  scope, drafts/recovery, MCP parity, and analytics sanitization when touched)?
- Does each function keep one level of abstraction on a clear main path?

## Tests

Standard: [testing](../../../docs/guides/testing.md).

- Does each rule have a test at the lowest layer that can observe it, asserting
  outcomes not internal calls, without weakening coverage policy?
- Would each test fail if the rule broke? Run a
  [focused mutation check](../../../docs/guides/testing.md#focused-mutation-checks)
  on consequential rules (auth, tenant scope, money, audit, concurrency).
- Is cross-layer overlap justified, and do async or browser tests wait on
  observable readiness, not fixed delays?
- Do tests use shared browser-error fixtures, and does each component case have
  a composed-screen case beside it?

## UI (when UI changes)

Standard: [UI development](../../../docs/guides/ui.md),
[UI verification](../../../docs/guides/ui-verification.md#verification),
[experience principles](../../../docs/foundations/experience.md), and
[interface copy](../../../docs/guides/interface-copy.md).

- Side by side with its precedent, does the UI match hierarchy, typography,
  density, spacing, alignment, and shared patterns on desktop and narrow
  widths, with long or missing content handled and focus visible,
  including WCAG 1.4.13 hover/focus content and forced colors?
- One gutter with text on the content edge (only icons or controls outdent);
  a rule inside a surface lighter than its edge; no layout shift between
  states; Badge for status only, no fact twice, no heading smaller than its
  text; popovers and menus on the shared popover surface.
- Are redundant controls removed while consequences, recovery states, and
  historical basis stay clear before acting?
