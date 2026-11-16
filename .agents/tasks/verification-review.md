# Verification review

Turn Merit's [verification records](../../docs/guides/verification.md#record-verification)
into fixes for the gaps they show, and remove the records once read, as one pull
request. This task runs every week on a schedule, and anyone can also run it by
hand. Every record in `verifications/` on the default branch is waiting for
review; the review removes the records it read, so the next run starts with
only newer ones.

Before starting, read the verification guide in full, along with
[AGENTS.md](../../AGENTS.md) and the [documentation guide](../../docs/guides/documentation.md).
Records describe single changes; the guides remain the standard for every change
this review makes.

## 1. Stop if there is nothing to do

If an open pull request is titled `chore: review verification records`, stop and
report it. If `verifications/` holds no records, stop and report that too.

## 2. Read the records

List the records on the default branch:

```sh
git ls-files 'verifications/*.md'
```

Read each one in full. Each file is named after its pull request; read that pull
request's title and description for context, and its review threads when a
dismissed finding needs it.

Earlier reviews removed the records they read, so also read the records removed
in the last four weeks. List the removing commits and paths, then read each
record as it was just before its removal:

```sh
git log --since='4 weeks ago' --diff-filter=D --format='commit %H' --name-only -- 'verifications/*.md'
git show <commit>^:verifications/<number>.md
```

These earlier records only help decide what recurs in step 3; this review fixes
and removes only the current ones.

## 3. Find recurring problems

Collect the entries from every record and group them by cause:

- **Could not verify:** what blocked the check, such as a missing runtime or tool,
  a blocked host, a missing credential, an unavailable browser or device, or a
  check that failed for reasons unrelated to the change.
- **Did not verify:** the reason the check was skipped. Compare it with the
  [verification policy](../../docs/guides/verification.md#verification); a skip
  the policy doesn't allow is a problem even once.
- **Dismissed review findings:** who raised the finding, what it asked for, and
  why it was dismissed. Repeated dismissals of the same kind mean the reviewer's
  guidance is wrong or the code's guidance is unclear. A dismissal whose reason
  doesn't hold is a problem even once.

A cause in a current record is recurring when it appears in two or more records,
counting the earlier ones. Skip a cause that an earlier review already fixed, or
that has an open issue, unless a current record shows the fix didn't work; then
reopen or comment on its issue. Leave one-off entries alone unless the bullets
above say otherwise; the next runs will show whether they recur.

## 4. Fix each problem where it belongs

| Problem                                                    | Change                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agents can't run a check in their environment              | Fix [the agent environment setup](../install-environment.sh) when the fix is small and certain; otherwise open an issue naming the check and what blocks it. |
| Agents skip or misjudge a check the guides cover           | Clarify the owning guide, following the documentation guide.                                                                                                 |
| Automated review repeats findings that get dismissed       | Tighten [the Greptile rules](../../.greptile/rules.md) or [its context files](../../.greptile/files.json).                                                   |
| The feature reviewer repeats findings that get dismissed   | Tighten the [feature review rubric](../skills/build-feature/review.md).                                                                                      |
| A dismissal doesn't hold, or a check fails without a cause | Open an issue naming the pull requests and what the dismissal or failure left unchecked.                                                                     |

Before opening an issue, search the open issues for the same problem. If one
exists, add a comment naming the new records instead.

Make only changes the records show a need for. Don't change production code or
tests; open an issue instead. Changes to coverage or required tests follow the
[coverage policy](../../docs/guides/testing.md#coverage-policy-changes) and need
the owner's approval, so list them under **Follow-ups**.

## 5. Remove the records

Delete every record read in step 2:

```sh
git rm verifications/<number>.md
```

Git history keeps them; `git log --all -- verifications/<number>.md` finds one
again. Records added after step 2 stay for the next run.

## 6. Propose the changes

Run `vp run check:docs`, plus the checks the
[verification guide](../../docs/guides/verification.md) selects for any other
file you changed.

1. Commit the fixes using the [commit conventions](../../docs/guides/development.md#commit-changes),
   with the record removal as its own `chore` commit.
2. Open one pull request titled `chore: review verification records` against the
   default branch, using the [repository template](../../.github/pull_request_template.md)
   and keeping the description concise. When the pull request changes more than
   records, add its own verification record as the verification guide describes.
3. In **Why**, give the number of records reviewed and the range of pull requests
   they came from.
4. In **What changed**, summarize the fixes by problem, and link any issues opened
   or updated. When nothing recurred, say so.
5. In **Follow-ups**, list only changes that need the owner's decision; omit when
   empty.

Open the pull request even when the only change is removing records, so the next
run starts from the records it hasn't seen.
