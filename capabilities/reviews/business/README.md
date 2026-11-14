# Review work and participation

Reviews owns review requests, received assessments and their versions, reviewer
assignments, private drafts, and authenticated submission. These stay together
because submission completes a request and appends an assessment in one transaction.
[Domain rules](src/domain) preserve each judgment's material and criteria basis.
The [basis policy](src/domain/basis.ts) compares application versions, criteria
versions, and criteria content separately as `same`, `different`, or `unknown`.
`reviewFreshness` derives currency from application versions and criteria content;
`assessmentStatus` also preserves outstanding work. Manager, reviewer, and MCP
reads use this policy; persistence supplies facts rather than deciding equality.
The [workflow](../../../docs/workflows/review-applications.md#review-basis-and-freshness-policy)
defines comparison and unknown-basis precedence, including criteria reversions.

Manager [review commands](src/server/commands/reviews.ts) require current workspace
authority. [Reviewer commands](src/server/commands/reviewer.ts) use assignment access;
an external reviewer gains no workspace membership. Manager reads never expose
private reviewer drafts. Accepted review requests, cancellations, reviewer
participation transitions, and assessments are recorded atomically through
[Audit](../../audit/business/README.md); private drafts and email delivery attempts
are not audited, and delivery failures do not undo a committed submission.

`review_states` owns the review concurrency revision. Requests, assessments and
reviewer submission advance this revision under the case lock; assignment and
private-draft revisions retain their independent meanings.

Applications' `MaterialVersion`, Rounds' `CriteriaVersion`, and Reviews'
`ReviewRevision` are distinct branded numbers. Owner schemas validate numeric
inputs at decoding boundaries; JSON and database representations remain numbers.
Review commands and restored drafts use the same version schemas: material and
criteria versions start at one, while review revisions can start at zero.
An assessment's recorded basis stays separate from the current versions captured
by its edit baseline. Saves bind that baseline to the application in the data
adapter; independently transported material queries carry the application ID.
Brands distinguish sequences, while authorization and ownership checks still
establish which records those sequences belong to.

`/api` is browser-safe. `/server` exports the manager and reviewer service factories
and authorized operations. Approved composition reads use `/schema`, `/scope`,
`/participation-schema`, and `/readers`. `/server/demo` exposes the recorder only for
trusted example seeding. Reviews reads application material and round criteria
through owner exports and has no dependency on recommendation implementation.

The [web package](../web/package.json) owns manager review editing and reviewer
participation. Run `vp run @merit/reviews#test`, `vp run @merit/reviews-web#test`,
and the [review](../../grantmaking/business/tests/reviews.integration.ts) and
[participation](../../grantmaking/business/tests/reviewer.integration.ts) integration scenarios.
