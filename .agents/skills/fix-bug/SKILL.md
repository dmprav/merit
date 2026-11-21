---
name: fix-bug
description: Take a Merit bug report or regression to a reviewed pull request. Confirms the intended behavior from the workflows or the requester, diagnoses the root cause behind a reproducing test, fixes it in the owning layer, proves the test fails without the fix, and records the verification. Use when asked to fix a bug, defect, regression, or broken behavior in Merit.
---

# Fix a bug

Turn a bug report into a pull request whose fix is proven: a test that fails
without it, a root cause the requester can read in two sentences, and no change in
behavior they did not agree to.

Read [AGENTS.md](../../../AGENTS.md) first. Its guidance applies throughout. This
skill composes the [grill](../grill/SKILL.md) and [diagnose](../diagnose/SKILL.md)
skills; follow them where a step names them.

## 1. Settle the intended behavior

A bug is a difference between what Merit does and what it should do, so first
find what it should do. Read the relevant [workflow](../../../docs/workflows/README.md),
the code that implements it, and its tests.

- **The workflow or tests decide it:** state the intended behavior and its source
  to the requester as a finding, and continue.
- **They are silent, or the report contradicts them:** the fix changes agreed
  behavior. [Grill](../grill/SKILL.md) the requester about it, and update the
  workflow in the same change.

Then write the fix brief:

```markdown
## Fix brief

**Problem:** <what happens, for whom, and how to trigger it>

**Intended behavior:** <checkable statements, each with its source: workflow
section, test, or the requester's approval>

**Out of scope:** <related problems noticed but not fixed here>
```

Approve the brief with the requester only when the intended behavior came from
grilling. Otherwise it is a record for the reviewer and the pull request.

## 2. Diagnose

Follow [diagnose](../diagnose/SKILL.md) in this session: build the reproduction as
a test at the owning layer, rank hypotheses, find the first wrong step, and fix it
there. Keep the red output.

Stop and return to the requester when the root cause shows that:

- the correct fix changes behavior the brief does not cover;
- it touches authorization, tenant scope, money, or audit history in a way the
  workflow does not already decide;
- it needs a schema change or data migration; or
- the change is better built as a feature. Say so, and suggest
  [building it as a feature](../build-feature/SKILL.md) instead.

Before finishing, search for the same flawed pattern in neighboring code. Fix
instances that share the root cause in this change; list others under
**Follow-ups**.

## 3. Review

For a fix beyond a few lines, or one in authorization, tenant scope, money, audit
history, or persistence, start a fresh `feature-reviewer` subagent following
[review.md](../build-feature/review.md). Pass the fix brief as the brief, the base
branch, the reproduction command, and a screenshot directory, and nothing about
how you found the cause. Ask it to also judge whether the fix addresses the first
wrong step rather than a symptom. Triage its findings as
[build-feature describes](../build-feature/SKILL.md#4-review-independently).

For a smaller fix, reread the full diff from disk against the review rubric's
**Architecture**, **Code**, and **Tests** sections, and say in the pull request
that the review was not independent.

## 4. Hand off

Commit with the `fix` type, following the
[commit conventions](../../../docs/guides/development.md#commit-changes). Open a
draft pull request with the [repository template](../../../.github/pull_request_template.md):

- **Why:** the problem in one sentence, and the issue link.
- **What changed:** the root cause, the fix, and the intended-behavior source.
- **Follow-ups:** other instances or related problems left out of scope.

Add the [verification record](../../../docs/guides/verification.md#record-verification)
with the reproduction command, its failing result without the fix and passing
result with it, the other checks run, and any review findings rejected with their
reasons. Mark the pull request ready.

## 5. Learn from the escape

The regression test is the primary guard against recurrence. When the bug belongs
to a class that has escaped before, apply
[encode repeat fixes in structure](../../../docs/foundations/principles.md#encode-repeat-fixes-in-structure):
propose a type, lint rule, or shared test helper that would have caught the whole
class, and add a reviewer question to
[Known escapes](../build-feature/review.md#known-escapes) only when no check can
decide it.
