# Future design: committee preparation and publication

**Not implemented.** This page preserves agreed design for review discussion,
committee briefs, and publication. Current grant work ends with
[manager recommendations](recommend-funding.md) and the
[committee decisions](record-decisions.md) a manager records. These sections describe
intended behavior, not available controls or a delivery commitment.

## Review discussion and committee readership

[Reviewer participation](participate-in-review.md) supports private drafts and
independent submissions today. Sharing other reviewers’ assessments for discussion
remains future work. Committee readers would receive explicit access to published
material, with the working area reserved for preparation.

## Prepare the committee brief

The brief brings together application summaries, supporting sources, submitted
assessments, disagreements, open questions, and the manager's recommendations and
reasons. It shows requested amounts, proposed allocations, and the budget remaining
or exceeded. Preparation can explore recommendations above budget; a reduced
request needs a viable revised plan.

The design allows AI to draft content and propose updates. Proposed revisions to
reviewed or edited material show what would change, the basis for the change, and
what it affects. They leave the person's writing intact until accepted. The
[authority and commitment principles](../foundations/experience.md#make-authority-and-commitment-clear)
distinguish this proposal flow from executing a requested, authorized edit. The
manager judges whether the brief is ready; questions intended for committee
discussion can remain open.

For the fictional Ride Together application, the brief makes the disagreement
and the committee's choice clear:

> Sam recommends €28,000 subject to written transport confirmation. Jules
> recommends waiting for confirmation before committing. Dana supports reserving
> the funding because the applicant's survey shows a clear need. The committee
> needs to decide whether to commit now or defer until transport is confirmed.

The brief links the reviewers' assessments and the evidence behind all three
positions.

## Publish a version for readers

Before publishing, the manager reviews the brief, selected evidence, and named
readers. Publication creates a stable, read-only version containing the cited
document, assessment, and criteria versions. Reviewer drafts and private notes
remain in the working area.

Preparation continues separately. Later publications show what changed and retain
earlier versions. Readers need current access to view any published version.

## Record decisions

[Recording committee decisions](record-decisions.md) is implemented: the decision, its
amount and conditions, the body that made it, and the manager who recorded it are kept
as versions that count against the round budget. This design no longer promises that a
decision links to a published committee brief.

Before implementing publication, define who must
approve, what the approval covers, and how it is established. The owning capability
must enforce those rules consistently across web and MCP, following the
[authority boundary](../foundations/architecture.md#authority-across-interfaces).
GitHub issues and milestones own delivery scope and sequencing.

[Current grantmaking workflows](review-and-decide.md)
