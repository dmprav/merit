# Feature review rubric

Review a feature change as someone who did not write it. You receive the feature
brief, the base branch, and a screenshot directory. Find where the change is worse
than the codebase it joins, and say how to fix it. Do not modify the repository.

The guides linked below own the detailed standards; this rubric lists the
questions that catch the failures seen most often. Read the linked sections you
need before judging against them.

## How to review

1. Read the brief. Open each named precedent and read it fully: the screen or
   story, the controller, and the tests. Then search for screens that present
   similar records or actions; if one is better built than the named precedent,
   report it.
2. Read every file changed in `git diff <base>...HEAD` in full, not only the
   hunks, so you see how the change fits its surroundings. Run
   `vpx tooling/verification/architecture/mechanisms.ts --base <base>` to see
   which cross-cutting mechanisms the diff extends or composes and which docs
   and decision records apply.
3. For UI changes, take your own screenshots following
   [UI verification](../../../docs/guides/ui-verification.md#verification) and the
   screenshot step in [build.md](build.md#compare-the-ui): the new UI and its
   precedent in the same states, viewport, and theme, at desktop and narrow widths.
   Look at each pair before answering the UI questions.
4. Answer each question below. Report only real problems, each with:
   - the rubric section and question it fails;
   - the file and line, or the screenshot path;
   - the precedent or guide it departs from;
   - a concrete fix.
5. End with your coverage: the precedents read, the screenshot pairs compared, and
   what you checked and found sound in each section. A review without this
   evidence is incomplete, especially one with no findings.

Do not report style preferences the linters enforce, or problems you cannot point
to in the change.

## Behavior

- When measurement changes, do the population, timing, and properties of the
  signal support the decision in the brief? Check what retries, failed actions,
  demo activity, and different interfaces contribute to the count.
- Does the change do everything under the brief's **Behavior**, and nothing under
  **Out of scope**?
- Are empty, long, missing, failed, conflicting, and read-only states handled as
  the brief and the precedent handle them?
- Does every difference from a precedent appear under **Departures**?

## UI

Standard: [UI development](../../../docs/guides/ui.md),
[UI verification](../../../docs/guides/ui-verification.md#verification),
[experience principles](../../../docs/foundations/experience.md), and
[interface copy](../../../docs/guides/interface-copy.md).

- Side by side with its precedent, does the new UI match hierarchy, typography,
  density, spacing, alignment, and framing? Is every visible difference explained
  by the person's task?
- Does it use the shared page composition, layout primitives, feedback, and
  confirmation patterns where the precedent does?
- Are there redundant controls, repeated labels, or explanations someone needs
  before acting but cannot see?
- Does it work at narrow widths, with keyboard focus, and with long content?

## Reuse

- For each new component, hook, helper, style, fixture, or test helper, is there
  an existing one that does the same job? Search by name and by behavior before
  answering no.
- Where a shared component nearly fitted, was it extended rather than copied into
  the feature?
- Are new shared pieces placed where the next feature would find them?

## Architecture

Standard: [architecture](../../../docs/foundations/architecture.md#design-principles)
and [web features](../../../docs/guides/web-features.md#choose-the-owning-layer).

- Is each business rule in the capability's `business` package, rather than in a
  view, controller, route, or adapter?
- Does each file sit in the layer that owns its responsibility: views,
  controllers, data, interface server code?
- Is each new abstraction justified by more than one real use or by a concrete
  requirement? Would the code be clearer inlined?
- Do business terms match the [domain concepts](../../../docs/domain/concepts.md)
  and stay consistent across UI, MCP, and code?

## Database and migrations

Standard: [database schema guide](../../../docs/guides/database.md) and
[schema changes](../../../docs/guides/development.md#schema-changes).

- When tables or columns changed, did you inspect the generated SQL in
  `foundation/db/database/migrations/` as well as the Drizzle `schema.ts` files?
- Do primary keys follow the surrogate/public-ID rules (no mutable natural keys),
  and do foreign columns use consistent names and non-redundant tenant-scoped FKs?
- Does every foreign key have a covering leading index, and does every closed
  status/kind column carry a SQL `CHECK` constraint?
- Are shared Drizzle helpers from `@merit/db/schema` reused rather than
  redefined locally?

## Code

Standard: [coding conventions](../../../docs/guides/coding-conventions.md).

- Does each function stay at one level of abstraction, with names that state its
  purpose in domain terms?
- Can a reader follow the main path without jumping between many small
  indirections or tracking hidden state?
- Is there dead code, leftover scaffolding, or commented-out code?

## Tests

Standard: [testing](../../../docs/guides/testing.md).

- Does each rule under **Behavior** have a test at the lowest layer that can
  observe it, in the package that owns it?
- Would each test fail if the behavior it names broke? For a consequential rule,
  try a [focused mutation check](../../../docs/guides/testing.md#focused-mutation-checks).
- Does each test assert an outcome, not internal calls or implementation details?
- Are failure, conflict, and authorization paths tested where the precedent tests
  them?
- Is any scenario repeated at another layer without the justification the testing
  guide requires?
- Do tests wait for observable readiness before acting on restored drafts or
  animated scroll instead of fixed delays, while keeping exact assertions?
- Do the tests follow the precedent's structure, fixtures, and helpers?

## Known escapes

Problems that reached the requester despite review (capped at 10 items / 45 lines
per [the skill](SKILL.md#6-learn-from-escapes)). Check each one; Phase 2 UI
verification probes will automate remaining layout and focus checks.

- Do integration fixtures establish updated authorization prerequisites across
  transport and cross-capability journeys? See [test behavior](../../../docs/guides/testing.md#test-behavior).
- After membership removal and restoration, do pending invitations and accepted
  assignments stay inaccessible until reinstated? See [review participation](../../../docs/workflows/participate-in-review.md).
- Do navigation popups close on history changes, delayed saves preserve moved
  focus, and disappearing controls move focus cleanly? See [UI verification](../../../docs/guides/ui-verification.md#verification).
- Can reference material stay readable while editing (close, resume, task switch,
  keyboard return) without losing draft or scroll position?
- Do conflict and history views align matching records on both sides, surface
  actual changed values first, and preserve unknown/historical basis?
- Does each invitation, withdrawn, access-ended, and recovery state show one clear
  outcome heading, preserved draft, and one action hierarchy on desktop and mobile?
- Do isolated stories match the connected screen's task placement, keeping
  synthetic test controls outside the product frame? See [Storybook states](../../../docs/guides/storybook.md#develop-states-in-storybook).
- Do assessments and recommendations distinguish outcomes, qualifications,
  attribution, and prior basis before acting? See [give emphasis a reason](../../../docs/foundations/experience.md#give-emphasis-a-reason).
- When compacting a header, does full destination context remain reachable via
  keyboard and touch without duplicate navigation? See [design for repeated use](../../../docs/foundations/experience.md#design-for-repeated-use).
- Do section edits keep values passive until section edit begins without row-level
  edit controls, and separate staff interpretation from applicant responses in
  historical records? See [editing scope](../../../foundation/ui/src/patterns/editing/editing.mdx).
