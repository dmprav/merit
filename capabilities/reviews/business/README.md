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
authority. [Reviewer commands](src/server/commands/reviewer.ts) require a current reviewer or program-manager membership
and the assignment. Organizations supplies its exclusive workspace lock to the
[review revocation collaborator](src/server/persistence/commands/membership.ts)
when review responsibilities end. Applications uses the
[application work collaborator](src/server/persistence/commands/application-work.ts)
to check whether review activity blocks deletion and to close outstanding requests
on withdrawal. Invites and resends share a transaction-scoped
workspace invitation lock while checking message limits and queuing delivery.
Other grant work can proceed in independent cases. Accepted review requests,
cancellations, reviewer participation transitions, and assessments are recorded atomically through
[Audit](../../audit/business/README.md); private drafts and email delivery attempts
are not audited.

Recorded assessment commands and reads use the [money contract](../../../foundation/money/README.md).
An unstated amount is `null`. An explicit zero is `{ "minorUnits": "0", "currency": "EUR" }`.
Draft saves accept the editor's decimal text, including an unfinished entry such as
`12.`. All clients use the same two-decimal limit when saving. Previously saved
draft text remains available for correction.

`review_states` owns the review concurrency revision. Requests, assessments and
reviewer submission advance this revision under the case lock; assignment and
private-draft revisions retain their independent meanings.

`/api` is browser-safe. `/server` exports the manager and reviewer service factories
and authorized operations. Approved composition reads use `/schema`, `/scope`,
`/participation-schema`, and `/readers`. `/server/integrations` exposes the
collaborators that Organizations, Applications, and Contacts call with review work;
`/server/demo` exposes review and assignment persistence only for trusted example seeding. Reviews reads application material and round criteria
through owner exports and has no dependency on recommendation implementation.

The [web package](../web/package.json) owns manager review editing and reviewer
participation. Run `vp run @merit/reviews#test`, `vp run @merit/reviews-web#test`,
and the [review](../../grantmaking/business/tests/reviews.integration.ts) and
[participation](../../grantmaking/business/tests/reviewer.integration.ts) integration scenarios.
