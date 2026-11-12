# Documentation review

Review Merit's documentation and propose improvements as one pull request. This
task runs daily on a schedule, and anyone can also run it by hand. Each run
covers everything that changed since the previous review and rereads one area
in full, so the whole documentation set gets a complete reread every few days.

The [documentation guide](../../docs/guides/documentation.md) is the standard
for every finding and change. Read it in full first, along with
[AGENTS.md](../../AGENTS.md) and the [documentation index](../../docs/README.md).
Judge findings against that guide, not general style preferences.

## Areas

Reread one area per run, in this order, starting again from the first after the
last:

1. Entry points: the project README, the documentation index, and each area index.
2. `docs/foundations/`
3. `docs/domain/`
4. `docs/workflows/`
5. `docs/guides/`
6. `docs/decisions/`
7. Public guides in `interfaces/site`, following their
   [authoring instructions](../../interfaces/site/src/features/docs/README.md).
8. Local documentation: package and module READMEs and colocated MDX.

## 1. Find the previous review

Review pull requests have the title `docs: review documentation`. The **Why**
section of each ends with a review record:

```text
Review record: baseline <commit SHA> · area <number and name>
```

- If an open pull request has that title, stop and report it.
- Otherwise read the record of the most recently merged review. Its baseline
  starts this run's change range. This run's area is the next one in the list.
- If no review has been merged, reread the entry points and skip the
  change-range step.

## 2. Review changes since the baseline

Start from the latest default branch. List the commits and files changed
between the baseline and the current commit.

- **Changed code, configuration, and scripts:** find the documentation that
  describes them by searching for changed module names, commands, routes,
  settings, and business terms. Check that descriptions, commands, and examples
  still match the implementation.
- **Changed documentation:** read each changed document completely, along with
  the documents it links to. Check that the change was worked into a coherent
  explanation, lives in its primary home, doesn't duplicate an explanation kept
  elsewhere, and doesn't present future design as available behavior.

## 3. Reread the area in full

Read every document in the area from its reader's starting point, along with
the code and linked guidance it describes. Check each one against the
documentation guide, especially for:

- accuracy against the implementation;
- each explanation living in its primary home;
- principle structure;
- superseded content;
- terms matching the [domain concepts](../../docs/domain/concepts.md) and the interface;
- links that let readers continue their task.

## 4. Improve and verify

- Revise each affected section as a coherent explanation rather than patching
  sentences. Leave clear writing alone.
- Fix inaccuracies first, then misplaced or duplicated knowledge, then clarity
  and structure.
- When the implementation and the documentation disagree and the intended
  behavior is unclear, don't pick one. Record the disagreement as a follow-up.
- Keep the pull request small enough to review in one sitting. Record any
  remaining findings as follow-ups.
- Run `vp run check:docs`. If public guides changed, also follow their
  verification instructions.

If nothing materially improves the documentation, open no pull request.
Summarize what you checked instead.

## 5. Open the pull request

1. Commit using the `docs` type and the
   [commit conventions](../../docs/guides/development.md#commit-changes).
2. Open one pull request titled `docs: review documentation` against the default
   branch, using the repository template.
3. In **Why**, say this is the recurring documentation review, and end with this
   run's review record.
4. In **What changed**, list each change with the documentation guidance it applies.
5. In **Follow-ups**, list unresolved disagreements and remaining findings.
