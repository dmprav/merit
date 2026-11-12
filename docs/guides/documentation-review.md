# Reviewing documentation

A recurring documentation review keeps Merit's documentation accurate and
coherent while the code changes quickly. Each review checks the documentation
affected by recent changes, rereads one area in depth, and proposes improvements
as a single pull request. The review can be run by a person or an automated
agent; this guide is its complete set of instructions.

Every change made during a review follows the [documentation guide](documentation.md).
Read it in full before starting, and judge each finding against it rather than
against personal style preferences.

## Understand what a review covers

**Each review covers everything that changed since the previous review, plus one
area reread in full.** Changes since the last review are where documentation
most often drifts: code behaves differently from its description, a document is
edited without revising the surrounding explanation, or knowledge is added in
the wrong home. The rotating full reread catches problems that predate recent
changes, so every area is reviewed completely within a short cycle.

Review the areas in this order, starting again from the first after the last:

1. Entry points: the [project README](../../README.md), the
   [documentation index](../README.md), and each area index.
2. [Foundations](../foundations/README.md).
3. [Domain](../domain/README.md).
4. [Workflows](../workflows/README.md).
5. [Guides](README.md).
6. [Decisions](../decisions/README.md).
7. Public guides in `interfaces/site`, following their
   [authoring instructions](../../interfaces/site/src/features/docs/README.md).
8. Local documentation: package and module READMEs and colocated MDX.

Reviewing all documentation in full every time would spread attention too thinly
to compare each document with the code it describes, and would produce pull
requests too large to review well.

## Identify previous reviews

Review pull requests use the title `docs: review documentation`. Their **Why**
section ends with a review record that the next review reads:

```text
Review record: baseline <commit SHA> · area <number and name>
```

The baseline is the default-branch commit the review started from; the area is
the one reread in full.

1. List open pull requests with that title. If one exists, stop and report it:
   a new review would overlap with changes still awaiting a decision.
2. Find the most recently merged review pull request and read its review record.
   Its baseline is the start of this review's change range, and the next area in
   the order above is this review's area.
3. If no review has been merged, review the entry points as the area and treat
   the change range as empty; the first review establishes the record.

## Review recent changes

Start from an up-to-date default branch. List the commits and files changed
between the previous baseline and the current commit.

For changed code, configuration, and scripts, find the documentation that
describes them: search for the names of changed modules, commands, routes,
settings, and business terms, and follow links into the changed paths. Check
that descriptions, commands, and examples still match the implementation.

For changed documentation, read each changed document completely along with the
documents it links to. Check that the change was integrated into a coherent
explanation, lives in its primary home, does not duplicate an explanation
maintained elsewhere, and does not present future design as available behavior.

## Reread the area in full

Read every document in the area from the reader's starting point, along with the
code and linked guidance it describes. For each document, check:

- Its reader's question is clear, and the answer comes first.
- Statements about behavior, commands, and configuration match the implementation.
- Each explanation lives in the home that owns it, with links rather than copies elsewhere.
- Principles have descriptive headings and bold opening statements, separated
  from descriptions of the current implementation.
- Superseded content has been removed or connected to its replacement.
- Terms are consistent with the [domain concepts](../domain/concepts.md) and the interface.
- Readers can follow links between this area and related documentation.

## Make and verify improvements

Revise each affected section as a coherent explanation, as the documentation
guide describes, instead of patching individual sentences. Leave clear writing
unchanged; a review that finds nothing to improve produces no pull request.

Fix inaccuracies first, then misplaced or duplicated knowledge, then clarity and
structure. When implementation and documentation disagree and the intended
behavior is unclear, do not choose one; describe the disagreement under
**Follow-ups** for a maintainer to resolve. Keep the pull request small enough
to review in one sitting, and list remaining findings under **Follow-ups**.

Run `vp run check:docs`. When public guides change, also follow their
verification instructions.

## Propose the changes

1. Commit following the [commit conventions](development.md#commit-changes),
   using the `docs` type and a concrete description of the changes.
2. Open one pull request titled `docs: review documentation` using the
   repository template.
3. In **Why**, state that this is a recurring documentation review and end with
   the review record for this review.
4. In **What changed**, list each change with the documentation guidance it applies.
5. In **Follow-ups**, list unresolved disagreements and remaining findings.
