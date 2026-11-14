# Grantmaking business model

Grantmaking composes the funder's work across four business capabilities. It owns
combined reading views, personal navigation, and fictional
examples. The owning capability contains each workflow's rules, commands, transaction
coordination, persistence, and reusable web interactions.

| Capability                                                  | Owns                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Rounds](../../rounds/business/README.md)                   | Configuration, budgets, manager responsibility, criteria and their history.                    |
| [Applications](../../applications/business/README.md)       | Case identity, material versions, working revisions, readiness, summaries, contact assignment. |
| [Reviews](../../reviews/business/README.md)                 | Requests, assessments, reviewer access, private drafts and submission.                         |
| [Recommendations](../../recommendations/business/README.md) | Manager proposals, allocation calculations, versions and audit coordination.                   |

Web and MCP use the services supplied by [application assembly](../../../app/src/server/services.server.ts).
The [workflows](../../../docs/workflows/review-and-decide.md) define behavior;
[extending the business API](extending-api.md) explains how to change it.

## Records and reading views

The [domain model](src/domain/model.ts) separates records that own changes from
views that combine them for reading.

| Record               | Owns                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Funding round        | Purpose, responsibility, budget, timing, and versioned assessment criteria.                           |
| Application case     | Staff preparation, contact assignment, and summaries for one request; judgments have separate owners. |
| Reviewer assignment  | Invited identity, access lifecycle, private draft, and authenticated submission for a review request. |
| Application material | The versioned request and supporting material available for assessment.                               |

Rounds and applications each have one permanent 12-character ID. The database,
domain records, web addresses, and MCP use that same identity. Applications link
to their round by its ID within the same organization. Fictional scenario labels
such as `A3` stay in example data; seeding derives distinct, stable IDs for each
workspace so renaming records does not break demo entry or repeat seeding.

`FundingRoundOverview` combines a round with application records;
`ApplicationRecord` combines intake with current reviews and the manager recommendation. Neither read view
transfers ownership. Round preparation cannot save application content. Material
excludes staff summaries and judgments. An assessment's basis identifies the
material and criteria versions used.

The case remains the unit of coordinated application work. A combined reading
view or financial total does not by itself require one transaction over every
application. Locks protect demonstrated rules: authorization, revisions, review
bases, and deletion eligibility. Proposed allocations can exceed a round's budget;
funding commitments are [future work](../../../docs/workflows/committee-decisions.md).

## Versions and attribution

The [application state guide](../../../docs/workflows/record-applications.md#understand-what-is-saved)
explains local edits, saved preparation, current material, and the shared working
revision. Persisted intake coordinates the case, material, and shared working
revision with append-only history. Their version references answer different
questions:

| Reference                                  | Meaning                                                                              | When it changes                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material version (`application.version`)   | Which application evidence a judgment concerns.                                      | Changed preparation material or a recorded correction/revision becomes current.                                                                             |
| Intake revision (`intake.revision`)        | Whether the application case or shared working revision changed since an edit began. | Accepted intake changes, including readiness, summary, contact assignment, and working-revision actions. A shared contact profile edit does not advance it. |
| Criteria version (`round.criteriaVersion`) | Which ordered criteria an assessment used.                                           | A changed criteria list is saved; round preparation has a separate concurrency revision.                                                                    |
| Review revision                            | Whether review work changed since a request or assessment edit began.                | Review requests, assessments, and corrections change the review state.                                                                                      |
| Recommendation revision                    | Whether the manager's recommendation changed since an edit began.                    | A recommendation is saved. Its recorded application version identifies the material considered.                                                             |

These sequences advance independently. Reviews stores its concurrency revision in
`review_states`; Recommendations derives its current revision from immutable version
records. An unchanged intake save retains its revision and creates no history entry.

An assessment retains both material and criteria bases when known; a manager
recommendation retains its application material basis. Changing current material
or criteria does not rewrite these references. Unknown assessment bases stay
unknown. A concurrency conflict and an outdated judgment are separate outcomes:
one rejects a stale write, while the other describes the relationship between
saved evidence and a saved judgment. [MCP preconditions](../../../docs/guides/mcp.md#edit-and-recover)
map the read values to tool arguments.

All accepted grant changes append events through the
[audit capability](../../audit/business/README.md) in the command's transaction.
The business write and event roll back together. Unchanged recommendations retain
their revision when content, author, and application basis match the current version.
Material, criteria, assessment, and recommendation versions remain with their owners.

`listWorkspaceActivity` authorizes grant access and reads only grant subjects.
Historical context supplies round filtering even after deletion; current titles and
links are resolved for the selected page. Creation receipts live in dedicated
application and round tables and survive eligible record deletion. Retry handling
never needs to interpret audit payloads.

`searchWorkspace` finds rounds and applications by name or applicant for program
managers. Rounds owns the match over its titles and Applications the match over the
stored current title and applicant; Grantmaking composes them with access, the round
title, ordering, and the limits in one read-only transaction and counts matches after
access applies. Typed text is never logged, and the transports carry it in request
bodies. The [workflow](../../../docs/workflows/review-and-decide.md#search-the-workspace)
describes matching and order.

### Keep application history readable

Applications owns creation receipts and the frozen intake snapshot format stored
in shared audit details. Grantmaking reads those snapshots through Applications' public decoder
and presents their material and attribution. Review and recommendation histories
remain with their owners and are not copied into intake changes. See
[Applications' history contract](../../applications/business/README.md#preserve-intake-history)
for stored fields, format validation, and predeployment resets.

Staff readiness, a correction, and receipt of an applicant's submission have
different meanings. Recording material received elsewhere establishes neither
authenticated applicant submission nor applicant approval. Missing requested
amounts remain null in API results, and totals disclose their count.

Review state separates outstanding requests from received assessments, corrections,
and follow-up judgments. Reads derive freshness from recorded material and criteria
bases; unknown bases remain unknown. Bounded content queries can retrieve an exact
material version and attribution independently of current projections and case history.
Browser and MCP views reuse these rules while choosing different response shapes.

## Reviewer participation

Reviews’ `createReviewerService` owns [assignment participation](../../../docs/workflows/participate-in-review.md)
separately from organization-wide grant work. It constructs recipient views on the
server: invitation metadata before acceptance, then the pinned material and criteria,
the author's private draft, and their own submitted assessment. Manager queries
select assignment status without draft content. Assignment history is a separate
bounded, authorized read. Bounded manager review
summaries expose authorship and participation/conflict status to existing MCP readers.

Each assignment belongs to one review request. Its revision coordinates lifecycle
changes; its private draft has an independent revision and save receipt. Submission
appends existing assessment versions, completes the request, advances those revisions,
and records its email intent in one transaction. Assessment authorship and assignment
events are immutable. Delivery failure does not undo a saved assessment.

Reviewers join through Organizations before accepting assignments. Each assignment
captures its qualifying reviewer or program-manager membership. Removing membership
or review responsibilities invalidates scoped access; rejoining or restoring a role
requires a manager to explicitly reinstate the assignment. Commands use the shared organization,
round, case, and account lock order so revocation and submission serialize. The
central access policy evaluates the current account, assignment, and membership facts.

## Personal navigation

`createNavigationService` owns personal shortcuts to this capability's rounds,
applications, and reviewer assignments. Target references use foreign keys with
cascade deletion; labels are resolved through current authorized reading views.
Pin writes serialize per account with a transaction advisory lock. They change
personal ordering without advancing grant revisions or creating business history.
The [navigation workflow](../../../docs/workflows/review-and-decide.md#find-and-return-to-work)
defines grouping and access behavior.

## Coordinate with contacts and organizations

Contacts owns live workspace profiles and contact history. Applications owns
application-contact assignment; Reviews owns requests and assessment attribution.
Current applications resolve linked profiles within the workspace. Editing a
profile does not advance application intake revisions; historical snapshots and
assessment attribution retain the details recorded at the time.

Application assembly supplies grantmaking's contact-usage operations to contacts.
Contact writes acquire the organization-owned grant-work lock and check outstanding
requests before archiving. Application changes capture resolved contact details
under the same lock. These explicit interfaces avoid a package dependency cycle:

- [Contact integration contract](../../contacts/business/src/server/grant-work.ts).
- [Grantmaking contact usage](src/server/integrations.ts).
- [Organization lock order](../../organizations/business/src/server/persistence/commands/locks.ts),
  exposed to commands through `@merit/organizations/locks`.

## Boundaries for future participation

Funding opportunities and rounds are distinct. Current work can organize applications
received elsewhere without creating an opportunity. Application identity remains
independent of grouping; moving cases or intake without rounds needs a defined workflow.

Applicant participation would need explicit application permissions and a submission
handoff. Applicant drafts and funder judgments have separate owners; delivering
material must not expose private drafts or internal assessments or require membership
in the funder's workspace. Applicant workspaces, opportunities, and awards are
separate capabilities to introduce when their behavior is needed.
