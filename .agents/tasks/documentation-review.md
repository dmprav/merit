# Documentation review

Bring Merit's documentation in line with the
[documentation guide](../../docs/guides/documentation.md) and propose the fixes
as one pull request. This task runs every morning on a schedule, and anyone can
also run it by hand. Each run reviews the documents affected by recent merges
plus one document from a fixed rotation, so documents nobody edits are checked
too.

Before starting, read the documentation guide in full, along with
[AGENTS.md](../../AGENTS.md) and the [documentation index](../../docs/README.md).
The guide is the standard for every finding and change.

## 1. Stop if a review is waiting

If an open pull request is titled `docs: review documentation`, stop and report
it.

## 2. Find where the last review stopped

Each review leaves a record, either at the end of its pull request's **Why**
section or, when it found nothing to fix, as a comment on the most recent review
pull request:

```text
Review record: reviewed through <commit SHA>
```

Use the newest record from either place. If there is none yet, start from
`b722f3f`. The commit is always one on the default branch.

## 3. Review recent merges

List the commits on the default branch after the recorded commit, oldest first:

```sh
git log --reverse --first-parent --format='%h %s' <recorded commit>..origin/main
```

Skip commits titled `docs: review documentation`. For each remaining commit,
review these documents:

- every Markdown or MDX document the commit changed;
- documents that link to or name a path the commit changed;
- the README or MDX beside the changed code.

Reread each document in full and fix where it doesn't follow the guide,
including where it no longer matches the code. Stop after the commit that brings
the total to about 15 documents. The last commit you finished is this review's
record; later commits wait for the next run.

## 4. Review today's rotation document

List the documents in a stable order:

```sh
git ls-files '*.md' '*.mdx' ':!:.github/**' ':!:.agents/**'
```

Count the days from 2026-11-13 to today in UTC, divide by the number of
documents, and take the document at the position of the remainder, counting
from zero. Reread it in full and fix where it doesn't follow the guide.

## 5. Keep changes to what the guide asks for

Make only changes that apply a specific part of the guide, such as giving an
explanation one primary home, removing superseded content, or correcting a
statement that no longer matches the code. Don't add new explanations; list
missing documentation under **Follow-ups** instead.

When the code and the documentation disagree and the intended behavior is
unclear, don't pick one. List the disagreement under **Follow-ups**.

## 6. Propose the changes

Run `vp run check:docs`. If public guides in `interfaces/site` changed, also
follow their
[verification instructions](../../interfaces/site/src/features/docs/README.md).

If there is something to fix:

1. Commit using the `docs` type and the
   [commit conventions](../../docs/guides/development.md#commit-changes).
2. Open one pull request titled `docs: review documentation` against the default
   branch, using the repository template.
3. In **Why**, name the commits and the rotation document reviewed, and end with
   this review's record.
4. In **What changed**, list each change with the part of the guide it applies.
5. In **Follow-ups**, list missing documentation and unresolved disagreements.

If there is nothing to fix, open no pull request. Post this review's record as a
comment on the most recent `docs: review documentation` pull request, if one
exists.
