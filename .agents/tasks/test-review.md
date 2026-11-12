# Test review

Bring Merit's tests in line with the [testing guide](../../docs/guides/testing.md)
and propose the fixes as one pull request. This task runs every day on a
schedule, and anyone can also run it by hand. Each run reviews the feature slices
touched by recent merges plus one slice from a fixed rotation, so tests nobody
edits are checked too.

Before starting, read the testing guide in full, along with
[AGENTS.md](../../AGENTS.md) and the [verification guide](../../docs/guides/verification.md).
The testing guide is the standard for every finding and change.

## 1. Stop if a review is waiting

If an open pull request is titled `test: review tests`, stop and report it.

## 2. Find where the last review stopped

Each review leaves a record, either at the end of its pull request's **Why**
section or, when it found nothing to fix, as a comment on the most recent review
pull request:

```text
Review record: reviewed through <commit SHA>
```

Use the newest record from either place. If there is none yet, start from
`4a7ce7e`. The commit is always one on the default branch.

## 3. Collect the owner's test feedback

List the pull requests merged after the recorded commit. Read their review
comments and conversation, and note every request from the repository owner to
change, move, merge, or remove a test. Each one names a defect pattern. In step
5, look for the same pattern across each slice you review, not only in the test
the comment named.

## 4. Choose the slices

A slice is one package directory: `capabilities/<name>`, `foundation/<name>`, or
`interfaces/<name>`. It covers that package's tests and every test elsewhere,
including `app/tests`, adapter suites, component tests, stories, and browser
specs, that exercises behavior the package owns.

List the commits on the default branch after the recorded commit, oldest first:

```sh
git log --reverse --first-parent --format='%h %s' <recorded commit>..origin/main
```

Skip commits titled `test: review tests`. Each remaining commit selects the
slices whose files, tests included, it changed; a change to `app/tests` selects
the slices whose behavior those tests exercise. Stop after the commit that
brings the total to three slices. The last commit you finished is this review's
record; later commits wait for the next run.

Then add today's rotation slice. List the slices in a stable order:

```sh
git ls-files 'capabilities/*' 'foundation/*' 'interfaces/*' | cut -d/ -f1-2 | sort -u
```

Count the days from 2026-11-13 to today in UTC, divide by the number of slices,
and take the slice at the position of the remainder, counting from zero. If it
was already selected, take the next one.

## 5. Review each slice as a whole

Read every test in the slice across all layers before changing any of them. A
defect is often visible only when two layers sit side by side. For each test,
check it against the testing guide:

- **Owning layer:** is the behavior verified at the lowest layer that can observe
  it, in the package that owns the rule?
- **Overlap:** does another layer repeat the same scenario without one of the
  justifications in [Justify overlapping coverage](../../docs/guides/testing.md#justify-overlapping-coverage)?
- **Worth testing:** does it assert a business outcome, a contract, or an
  observable effect, rather than internal method names, call counts, a
  discarded implementation, framework behavior, or a constant restated?
- **One behavior:** does it explain one behavior with its own setup, so unrelated
  rules fail independently?
- **Assertion strength:** would it fail if the rule it names were wrong? Use a
  [focused mutation check](../../docs/guides/testing.md#focused-mutation-checks)
  when in doubt about a consequential rule.
- **Test data:** are the values that decide the assertion explicit, and does it
  use the owning capability's fixtures rather than demo records picked by
  position?
- **Cohesion:** does the suite read as one explanation of the package's
  behavior, with consistent names, grouping, and fixtures, and no near-duplicate
  tests that differ only in incidental input?

## 6. Keep changes within the coverage policy

Merge, move, rewrite, or remove tests so each behavior is verified once at its
owning layer, plus justified overlap. Before removing or moving a test, confirm
that a remaining test asserts each guarantee it covered, and move any unique
assertion to the owning layer first.

Never remove the only test of a guarantee, lower a threshold, narrow measured
scope, add coverage-ignore directives, or skip a test. Those changes follow the
[coverage policy](../../docs/guides/testing.md#coverage-policy-changes) and need
the owner's explicit approval; list them under **Follow-ups** instead. Don't
change production code; list production defects that the tests reveal under
**Follow-ups** too.

When a missing behavior test is the defect, add it at the owning layer.

## 7. Propose the changes

For each package whose tests changed, run its full test command, for example
`vp run @merit/grantmaking#test`, so its coverage thresholds are checked. Run
the integration, component, or browser suites whose files changed, following
the [verification guide](../../docs/guides/verification.md). Report any check
you could not run and why.

If there is something to fix:

1. Commit using the `test` type and the
   [commit conventions](../../docs/guides/development.md#commit-changes), one
   commit per slice.
2. Open one pull request titled `test: review tests` against the default
   branch, using the repository template.
3. In **Why**, name the commits, the owner feedback from step 3, and the slices
   reviewed, and end with this review's record.
4. In **What changed**, group changes by slice. For each removed or moved test,
   name the test that still verifies each of its guarantees and the part of the
   testing guide the change applies. List the checks run.
5. In **Follow-ups**, list changes that need the owner's approval, production
   defects, and gaps in the testing guide that would have prevented a recurring
   finding.

If there is nothing to fix, open no pull request. Post this review's record as a
comment on the most recent `test: review tests` pull request, if one exists.
