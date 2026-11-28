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
The [assessment projection](src/domain/assessments.ts) selects the latest amendment
of each non-superseded judgment and includes outstanding requests. The review
workspace shares this selection while retaining access to earlier records.
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

An [AI review](../../../docs/decisions/0017-ai-review.md) is a separate immutable
record (`ai_reviews` with its sections, items, citations and questions), never an
assessment, so it joins no review summary, status or budget total. The
[run command](src/server/commands/ai-reviews.ts) checks `work_on_grants` through
the application case lock, then consent, withdrawal, demo and provider availability
(one [policy](src/domain/ai-review.ts) shared with the application page). It reads
the material version and criteria, releases its transaction, and only then calls
the injected `AiReviewer` port, so no database transaction or lock is held while
the provider works. A caller that showed the material to a person names the
application and criteria versions it showed, and a run that reads others sends
nothing and returns `conflict`. The reply is validated with Zod (text with a NUL
character is rejected) and every citation is verified against the material that was
sent. A reviewer that carries a stop signal ends the provider request, and a run
whose signal has ended saves nothing and returns `stopped`. When the provider fails,
the run looks once more for a review saved under its identity by a concurrent run
before reporting `failed`. A second short transaction repeats the checks, saves
against the basis read at the start in bounded insert batches, stamps the run when
it is inserted so history order is commit order, records `ai_review.recorded`, and
reports the `ai_review_saved` outcome after commit. The provider implementation
lives in the application server, so this package has no provider dependency.
Database policies limit these tables to program managers in a workspace scope.

Recorded assessment commands and reads use the [money contract](../../../foundation/money/README.md).
An unstated amount is `null`. An explicit zero is `{ "minorUnits": "0", "currency": "EUR" }`.
Draft saves accept the editor's decimal text, including an unfinished entry such as
`12.`. All clients use the same two-decimal limit when saving. Previously saved
draft text remains available for correction.

`review_states` owns the review concurrency revision. Requests, assessments and
reviewer submission advance this revision under the case lock; assignment and
private-draft revisions retain their independent meanings.

Reviewer invitation and submission emails are delivered by the `reviewer-message:<messageId>`
[workflow](src/server/reviewer-message.workflow.ts), started after the message commits. Its
[activities](src/server/commands/reviewer-delivery.ts) recheck the message, the assignment and the
member's access before every attempt, send with the message ID as the provider's idempotency key,
and record the outcome through `merit_finish_reviewer_message` with the message's delivery token.
The message stays `pending` during about fifteen minutes of automatic retries, then becomes
`failed`; resend queues a newer message with its own workflow. `retry_notification` resets the
failed message to `pending` with a fresh delivery token through `merit_retry_reviewer_message`, in
the command's transaction, then runs its workflow again under the same ID; a run still open when
the retry happens delivers it again before it closes, and reconciliation restarts any pending
message whose run has closed. The assistant's retry of a failed invitation it saved uses the same
function, in its own transaction. The function revives only the newest message of its kind in a
workspace the member can access, and an invitation only while its assignment is still invited and
unexpired. A workflow sends only a message that is still `pending`. Requests wait briefly for the
first outcome by polling Postgres.
A privileged `merit_pending_reviewer_messages` function lists, across workspaces, identifiers
of the newest unfinished message per kind and assignment whose acting member is active with a
membership in an active workspace, so reconciliation can start missing workflows. An invitation
acts for the requesting manager. A submission notice, which goes to that manager, acts for the
submitting reviewer while they remain an active member and otherwise for the manager, so a
reviewer who left cannot strand it. `@merit/reviews/testing` supplies an inline stand-in for the
workflow in business tests.

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
