---
name: build-feature
description: Plan, build, and self-review a Merit product feature end to end. Grills the requester about behavior until a feature brief is agreed, anchors the work to the closest existing screen, controller, and tests, then has an independent reviewer check UI, reuse, architecture, code, and tests before opening a pull request. Use when asked to implement a user story, product feature, or new screen or workflow in Merit.
---

# Build a feature

Turn a request into a merged-quality pull request that needs little checking by
the requester. The requester spends attention in one place, agreeing the
[feature brief](#2-grill-until-the-brief-is-agreed), and you carry the rest,
including an independent review against the
[review rubric](review.md).

Most poor results come from one gap: code written without a concrete existing
example to match. Every phase below anchors the work to the closest established
precedent and makes each departure from it explicit.

Read [AGENTS.md](../../../AGENTS.md) first. Its guidance applies throughout.

## 1. Ground the request

Before asking anything, learn what the codebase already answers.

1. Read the relevant [workflow](../../../docs/workflows/README.md) and
   [domain concepts](../../../docs/domain/concepts.md) for the business behavior.
2. Find **precedents**: the existing screen, controller, data adapter, business
   operation, and tests closest to what is requested. Start from
   [find an existing workflow](../../../docs/guides/web-features.md#find-an-existing-workflow)
   and search for screens that present similar records or actions. Open them
   in Storybook or the running demo, not only in code.
3. Note what each precedent gives you to reuse: shared components and
   patterns from [UI development](../../../docs/guides/ui.md), controller and
   recovery behavior, test files and fixtures.

## 2. Grill until the brief is agreed

Interview the requester until you share one understanding of the feature. Walk
the decision tree in dependency order, resolving one branch before the
decisions that depend on it.

- Ask **one question at a time**, with your recommended answer and its reason.
  The requester can then reply with a word.
- Do not ask what the code or docs already answer. Look it up and state it as
  a finding the requester can correct.
- Ask about behavior and product meaning, not implementation details you can
  decide with the guides.
- Cover, where relevant: who does this and with what authority; the states a
  record can be in and the transitions between them; validation and business
  rules; what is saved and audited; empty, long, and missing content; failed
  saves, conflicts, and recovery; and what changes in MCP or other interfaces.
- Confirm the precedents. Show the requester which existing screen the new UI
  will match and ask whether that is the right model. This one question
  prevents most UI that looks worse than its neighbors.
- Stop when no open question would change what you build.

Then write the **feature brief** and ask the requester to approve it:

```markdown
## Feature brief

**Outcome:** <one sentence: who can now do what, and why it matters>

**Behavior:** <the agreed rules, states, and edge cases, as short bullets>

**Out of scope:** <what was discussed and deliberately excluded>

**Precedents:**

- UI: <existing screen or story this matches>
- Behavior: <existing controller or workflow this follows>
- Tests: <existing test files this mirrors>

**Plan:** <owning capability and layers, from the web features guide;
the business operation; new or extended shared components>

**Departures:** <each place the plan differs from a precedent, and the
concrete requirement that justifies it; "None" is a good answer>
```

Do not start implementing before approval. If the requester asks you to
proceed without grilling, still write the brief and state your assumptions in
it.

## 3. Build from the precedents

Follow the brief. Copy the structure of the precedents, then change only what
the feature requires.

- Place each change in its owning layer, as described in
  [web features](../../../docs/guides/web-features.md#choose-the-owning-layer)
  and the [architecture](../../../docs/foundations/architecture.md#model-grant-work-explicitly).
- Use existing shared components and patterns. If one nearly fits, extend it
  rather than building a feature-local copy.
- Write tests at the layer that owns each rule, following
  [testing](../../../docs/guides/testing.md#choose-the-owning-layer), shaped
  like the precedent's tests.
- If something forces a departure that is not in the brief, add it to
  **Departures** with its reason. If it changes agreed behavior, ask the
  requester before continuing.

Run the checks the [verification guide](../../../docs/guides/verification.md)
selects for the change.

## 4. Review with fresh eyes

Review the finished change with an **independent reviewer**: a subagent that
did not write the code and starts without your context. The author of a change
reads it with the intent in mind and misses what is actually there.

Give the reviewer the feature brief, the branch diff, and the instructions in
[review.md](review.md). Ask it to report findings with file and line, the
precedent the code departs from, and a concrete fix. When subagents are not
available, follow [review.md](review.md) yourself, rereading each file from the
start instead of from memory.

Fix every finding you agree with. For a finding you reject, record why under
**Departures**. Review again after substantial fixes; stop after two rounds and
list anything still open under **Follow-ups**.

## 5. Hand off

Commit following the
[commit conventions](../../../docs/guides/development.md#commit-changes) and
open a pull request with the repository template:

- **Why:** the outcome and a link to the issue, followed by the approved brief.
- **What changed:** the changes, the precedents reused, and the verification
  run, including screenshots of the new UI beside its UI precedent at the same
  viewport.
- **Follow-ups:** unresolved review findings and friction you met.

Greptile reviews the pull request after it opens. Address its comments like
reviewer findings.

## 6. Learn from escapes

When the requester points out a problem the review missed, fix it, then add a
concrete, checkable item to **Known escapes** in [review.md](review.md) in the
same pull request. Phrase it as a question a reviewer can answer from the code
or a screenshot, and link the guide section it comes from. When a guide was
missing the guidance, improve the guide and link it instead.
