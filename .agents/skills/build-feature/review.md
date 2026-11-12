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
   hunks, so you see how the change fits its surroundings.
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
- Do the tests follow the precedent's structure, fixtures, and helpers?

## Known escapes

Problems that reached the requester despite review. Check each one. Add to this
list as described in [the skill](SKILL.md#6-learn-from-escapes).

- None recorded yet.
