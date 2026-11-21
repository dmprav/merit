---
name: diagnose
description: Find the root cause of a Merit bug, failing test, or regression by first building a command that reproduces it, then testing ranked hypotheses against that command, and leaving a regression test at the owning layer. Use when something behaves wrongly, a check fails for an unclear reason, a test is flaky, or a fix has already failed once.
---

# Diagnose a failure

Find the first wrong step behind a failure and prove it, so the fix removes the
cause instead of quieting the symptom. This applies the
[fix root causes](../../../docs/foundations/principles.md#fix-root-causes) and
[prove it on the real surface](../../../docs/foundations/principles.md#prove-it-on-the-real-surface)
principles.

## 1. Build the reproduction first

**Do not form a theory until one command shows the failure.** Everything after
this step is judged by that command, so most of the effort belongs here.

The command must be:

- **red-capable:** it fails now and will pass only when the behavior is right;
- **deterministic:** repeated runs give the same result; a flaky failure first
  needs its varying input found and pinned;
- **fast and agent-runnable:** no manual steps, so it can run after every change.

Prefer the lowest layer that can observe the wrong outcome, from
[choose the owning layer](../../../docs/guides/testing.md#choose-the-owning-layer):

1. a pure test in the owning package (`vp run <package>#test`);
2. a capability or application integration test against PostgreSQL;
3. an adapter test for MCP or server-function contracts;
4. a component test or Storybook interaction test;
5. a browser test through the application;
6. a script against the running demo, when nothing above can observe it.

Write the reproduction as the test that will guard the fix, in the owning
package's existing test file and shaped like its neighbors. Run it and keep the
failing output: the assertion and the observed value, not a type or timeout error.

If the failure cannot be reproduced, say so, state what you tried, and stop
before changing code. A fix you cannot show failing first is a guess.

## 2. Rank hypotheses

List three to five explanations that each predict something the reproduction can
check, most likely first. For each, name the observation that would rule it out.
When the requester is available and the cause is not obvious, show the list
before investigating so they can add what they know.

Then test them in order. When a check fails unexpectedly, suspect the
observation method before the system: the wrong fixture, a cached result
(`vp run --last-details`), or a stale build.

## 3. Instrument with a removable tag

When you add temporary logging, prefix every line with one unique tag such as
`[DEBUG-a4f2]`. Never log secrets, tokens, or personal data from fixtures; write
`<REDACTED>` in their place.

## 4. Fix the first wrong step

Trace the failure back to the first place the state or value goes wrong, and fix
it there, in the [layer that owns the rule](../../../docs/foundations/architecture.md#model-grant-work-explicitly).
A guard downstream is a fix only when the state it handles is legitimate.

After two fixes that failed on the same assumption, stop changing code and test
that assumption directly.

## 5. Prove and clean up

1. Run the reproduction and confirm it passes.
2. Confirm it fails without the fix: set aside only the non-test changes, run the
   reproduction, and see the assertion fail on the wrong value. Restore the fix.
   This is the [focused mutation check](../../../docs/guides/testing.md#focused-mutation-checks)
   applied to the fix itself.
3. Search for the tag (`git grep -n 'DEBUG-a4f2'`) and remove every instrumented
   line. Nothing tagged may remain.
4. Run the checks the [verification guide](../../../docs/guides/verification.md#verification)
   selects for the changed packages.

Report the reproduction command, the root cause in one or two sentences, the
hypotheses ruled out and how, and the red and green results.
