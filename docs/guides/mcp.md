# Work with Merit through MCP

Connect an OAuth-capable Streamable HTTP client to `/mcp/workspace` to try a
fictional demo, carry out grant work, or complete your own review assignments.
MCP requires a signed-in account. The browser also offers an anonymous demo.
For Clerk configuration, live access checks, and authentication troubleshooting,
use [MCP operations](mcp-operations.md).

## Connect and find your work

1. Add `http://localhost:3000/mcp/workspace` to a locally reachable client, or use
   the deployed site's origin. See [local development](development.md).
2. Sign in and grant the client the access it needs. Website cookies do not
   authenticate MCP. Workspace and review work require current membership;
   assignments additionally restrict review access.

Choose your starting point:

| Task              | Start with                                        | Continue with                                                                                            |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Try Merit         | `start_demo`                                      | Open the returned `roundRef` with `get_funding_round` or list rounds using the returned `workspaceSlug`. |
| Manage grants     | `list_workspaces`, then `list_funding_rounds`     | [Read context](#read-the-context-you-need) and [edit](#edit-and-recover).                                |
| Complete a review | `list_my_reviews`, then `get_reviewer_assignment` | [Participate in reviews](#participate-in-and-manage-reviews).                                            |

`start_demo` resumes the account’s active example or starts a new one. The
example expires after seven days. If it has expired, repeat with `fresh: true`.
To replace an active example, choose **Reset demo** in the browser.
See the [demo workflow](../workflows/public-demo-and-access.md) for access and storage.

Discover workspace slugs and record IDs
through the read tools. Workspace slugs identify organizations to clients; rounds
and applications use the same permanent IDs across MCP, web, and storage, as
described in the [business model](../../capabilities/grantmaking/business/README.md#records-and-reading-views).
Tool discovery includes input schemas, success output schemas, and explanations of the required versions and
monetary formats. Text and structured results carry the same validated data.

## Choose client access

| OAuth grant        | Allows, subject to current Merit permissions                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace:read`   | Workspace discovery, rounds, applications, manager assignment views, contacts, and workspace members                                   |
| `grants:write`     | Round preparation, intake, reviews, reviewer invitations and assignment management, recommendations, committee decisions, and contacts |
| `reviews:read`     | Your reviewer assignments, assigned evidence, private drafts, and submissions                                                          |
| `reviews:write`    | Accept/decline assignments, report conflicts, save private drafts, submit and amend your assessments                                   |
| `onboarding:write` | Start or resume the signed-in account's demo                                                                                           |

Grant the scopes needed for the task. For example, trying a sample round requires
`onboarding:write` to start the demo and `workspace:read` to read the round.
A reviewer’s private work has its own scopes. Every tool acts for the person who
signed in and granted consent.

The server verifies OAuth identity and client ID on each request, then checks the
required grant for each tool. Shared application operations recheck current
membership and authority. Knowing an ID, retaining an old token, or supplying a
person's identity in tool arguments does not grant workspace access.

## Read the context you need

For every paginated list and history, pass the returned `nextPage` object directly
to the same tool. It contains the original filters, page size, and continuation.
A `null` value marks the last page. Lists accept a `limit` from 1 to 50.

Record lists use stable identifier order. Round and application histories use
ascending revision order. Other histories and workspace activity are newest first.
These are live reads: changing a title does not move a
record between pages, but records inserted before a cursor require restarting
the list to discover them. Each request rechecks access. Pagination is not a
transactional snapshot of a workspace.

For grant work, read a round with `get_funding_round` using its `workspaceSlug`
and `roundId`. Use `list_applications` to find `applicationId` values, then
`get_application` for current context and revision preconditions. Results include
browser links; IDs stay stable when titles change.

`get_funding_round` returns a compact overview with exact financial totals for the
**whole round**, independently of application pagination. `get_application`
returns current intake, review, recommendation, application and criteria versions.
`list_application_reviews` returns current assessments and outstanding requests
with server-derived freshness; it does not include their prose or old versions.
Review summaries use a cursor combining kind and ID, so a request and assessment
with the same ID remain distinct.

To find a known record without paging, call `search_workspace` with a `workspaceSlug`
and a `query` of up to 200 characters. It returns at most 5 rounds and 10 applications,
each group with its `total` number of matches, best match first, and each result's
public `id`, `matchQuality` (`exact`, `prefix`, or `contains`), and the fields the web
search shows. Every word must appear in a round's title or in an application's title
and applicant together, ignoring case and accents. Only the current recorded
application version is searched. Pass a result's `id` to `get_application` or the
funding round tools for details; refine the query rather than paging. The
[workflow](../workflows/review-and-decide.md#search-the-workspace) explains matching
and order. Current program managers only.

To catch up on recent changes across a workspace, call `list_workspace_activity`.
It returns who changed shared grant work, newest first, in pages of up to 50
entries. Optional `roundId` (the round and
its applications, including their review requests, reviewer responses, assessments,
recommendations, and committee decisions) and `personId` filters
narrow the list, as on the web. Take person IDs from the returned `people`. Each entry carries the
recorded person's name, web or MCP-client provenance, a stored action name, and the
record's current title and browser link, or a null record that no longer exists.
Only current program managers can read it. The
[workflow](../workflows/review-and-decide.md#catch-up-on-shared-changes) lists what
is recorded.

Fetch longer material through `get_application_content` or
`get_funding_round_content`. Choose a named section from the tool's input schema.
For criteria, read the `criteria` section with the `criteriaVersion` from a review
or round to retrieve just that version. Omitting it retrieves the current criteria.
For a specific assessment or review request, supply `entryId`. Use the history
listings to find revisions, then fetch an `intake_change`, `recommendation_change`,
or `preparation_change` with that `revision`. Intake and preparation history remain
readable after an eligible record is deleted. Intake changes contain application
material, intake facts, and the working revision; review and recommendation
histories remain separate.

A content result contains a JSON text fragment, its `fingerprint`, `offset`,
`totalCharacters`, and `nextOffset`. A request returns at most 8,000 Unicode
characters. When `nextOffset` is not null, repeat the same source request with
that offset and the returned fingerprint. Concatenate the fragments before parsing
JSON. A changed fingerprint returns `conflict`; restart from offset zero. An
absent optional source is the JSON value `null`. Invalid offsets or a missing
required source identifier return `invalid_range`. No content is silently truncated.

`get_contact` returns the current profile. `list_contact_applications` shows
applicant and reviewer associations, including historical review use.
Use `list_team_members` to find eligible people when choosing a round manager or
inviting a reviewer. A round manager must be an active program manager. The
save operation checks eligibility again.

## Edit and recover

| Work              | Tools                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare rounds    | `create_funding_round`, `edit_funding_round`, `delete_funding_round`                                                                                                    |
| Record intake     | `create_application`, `edit_application`, `select_application_contact`, `mark_application_ready`, `withdraw_application`, `reinstate_application`, `delete_application` |
| Revise intake     | `start_application_revision`, `save_application_revision`, `publish_application_revision`, `discard_application_revision`                                               |
| Review            | `request_review`, `cancel_review_request`, `record_assessment`, `correct_assessment`                                                                                    |
| Recommend         | `save_recommendation`                                                                                                                                                   |
| Maintain contacts | `create_contact`, `update_contact`, `archive_contact`, `restore_contact`                                                                                                |

Read before editing. Preserve the original preconditions for strict checks until the save succeeds:

| Command                                                                            | Preconditions                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Round purpose, criteria, budget edit or deletion                                   | `expectedPreparationRevision` from `round.preparationRevision` (optional LWW for title, date, manager)  |
| Intake submission edits, revisions, readiness, withdrawal, reinstatement, deletion | `expectedIntakeRevision` from `application.intakeRevision` (optional LWW for staff summary and contact) |
| Recommendation                                                                     | `expectedRecommendationRevision` and `expectedApplicationVersion`                                       |
| Review request, cancellation, assessment recording, or correction                  | Target-scoped check using `expectedAssessmentVersion` or review/application/criteria preconditions      |
| Contact profile update vs archive/restore                                          | `expectedContactRevision` required for archive/restore (optional LWW for profile update)                |

When a recommendation depends on an assessment still using current evidence, select a current
assessment in `list_application_reviews` and include `expectedCurrentAssessment: { id, version }`
in `save_recommendation`. Use the selected summary’s `id` and `assessmentVersion`. Merit checks
that the same assessment version is still current when saving. A correction, superseding
assessment, or change to its evidence basis returns `conflict`. Recheck the assessment before
deciding whether to retry.

Application preconditions come from `get_application`. If strict
preconditions change before the write, the operation rejects the stale request with `conflict`.
Independent metadata updates (round name, committee date, responsible manager, staff summary,
applicant contact link, and contact profile details) apply last-write-wins without rejecting stale revisions. Contact
archive and restore preserve its current details inside the same transaction;
clients do not resubmit the entire contact to change its lifecycle.

Round details and application content accept partial edits: send the fields being
changed and omit the rest. Clearing a meeting date uses `null`; clearing optional
text uses an empty string. Staff summary edits send only the summary. Applicant
contact details come from the selected workspace contact; update its shared profile
with contact tools or use `select_application_contact` to change the person.

A successful result has `status: ok`. Business failures are structured tool errors:
`conflict` means reread and reconcile; `not_found` or `forbidden` can mean access
changed; `invalid` includes a capability-specific reason. Missing OAuth scopes
produce HTTP 403 with a `WWW-Authenticate` challenge identifying the required
grants and resource metadata. An inactive account is denied without asking for
additional scopes. Unexpected failures return `unavailable`
without internal details. An incomplete or invalid operation response also returns
`unavailable`; clients must not treat it as a confirmed save or a missing record.

Unexpected failures include a `diagnosticId` that matches a server log entry
with the tool name and whether tool execution or response validation failed. This supports
investigation without recording tool arguments, returned data, or exception messages.

Retain creation `requestId` values, new contact IDs, and review creation IDs across
retries. Version checks prevent duplicate edits from being applied again; a retry
may return a conflict after the original save succeeded. After a lost response,
read the current state before deciding whether another save is needed. Successful
mutations identify the affected record; edits return the resulting revision where
applicable. Review invitations send email after commit, and a request returns its delivery
status after at most a few seconds: `pending` while automatic retries continue for about fifteen
minutes, then `failed`. Inspect delivery status and use resend to recover a failed email. Review
requests only track work.

Requested edits save directly. The first budget amount saves without a reason; a reason
is required only for a later change, a clear, or an amount set after a clear. There is no
additional web-confirmation step. Ask for suggestions when no save is
intended; client conversations are outside Merit's verification boundary. Saving a
recommendation does not commit funding. To record what a committee decided, use
`record_committee_decision`; a Fund or Fund with conditions decision commits its amount
against the round budget, while Defer and Decline commit nothing. See
[recording committee decisions](../workflows/record-decisions.md#in-mcp). Publishing a working intake revision makes that correction or revision current;
public publication is not implemented in either interface.

## Participate in and manage reviews

A reviewer needs current reviewer or program-manager membership and their own
assignment. Use `list_my_reviews` and `get_reviewer_assignment` to find and read
your assignments. The assignment read
returns the complete authorized page: invitation context, assigned material and
criteria, private draft, and submitted versions. Before acceptance or while access
is paused, protected content is null; a visible invitation does not grant access
to evidence. Other people's drafts are never available to managers.

Use `respond_to_review` with `accept`, `decline`, or `report_conflict`. Declining an
accepted assignment withdraws before submission. Acceptance verifies the invited
email on your account. Keep `assignment.revision` as `expectedRevision` and reuse
`commandId` after an unconfirmed write.

`list_application_reviewers` returns assignment summaries. Managers use
`list_reviewer_history` for an assignment's lifecycle and submitted-assessment
events, newest first, following `nextPage`. Both reads check current
access and exclude private drafts.

`save_reviewer_draft` saves against `draft.revision` as `expectedDraftRevision`.
Draft amounts are decimal EUR strings. `submit_reviewer_assessment` submits that saved
revision. To amend, save a new draft with an explanation in `draft.note`, then
submit it. Retain the same command ID and original revision on retries.
Submission emails are subject to the [reviewer notification limits](../workflows/participate-in-review.md#read-draft-and-submit).
Call `get_reviewer_assignment` to read `assignment.notification`, the delivery
status of its latest queued submission email, or `null` if none was queued.

Managers use `list_application_reviewers`, `invite_reviewer`, and
`manage_reviewer_assignment`. Create a review request first, then invite its
contact using the email recorded on their qualifying membership. If they have not
joined yet, an owner or administrator opens **Workspace settings → Members & access**
on the website and invites them with the reviewer role. After the recipient accepts
membership, the manager can send the assignment invitation through MCP. Management actions
end or reinstate access, clear conflicts with a reason, resend invitations, or retry
submission notifications. Clearing a conflict requires the reviewer to accept again.
These tools preserve the [reviewer workflow](../workflows/participate-in-review.md).

## Understand attribution

Grant-work history records the person, timestamp, and interface. Entries
for changes made through MCP also record the verified OAuth client ID. Web history displays that provenance alongside the actor;
MCP reads return it as structured data. Client-supplied names are not trusted as
identity. Earlier records without provenance are shown as not recorded.

Provenance establishes who acted and through which client. It does not establish
whether an AI generated the content or whether a human reviewed each action.

## Monetary values

Round and application reads, recommendation allocations, and recorded assessments
use exact values such as `{ "minorUnits": "12345", "currency": "EUR" }` for €123.45.
Use that object when recording or correcting an assessment, or `null` for an unstated
amount. The assignment read returns the same format for submitted versions.
In round preparation history, `budgetChange.before` and `budgetChange.after`
use this exact form. The `beforeDisplay` and `afterDisplay` fields give formatted
amounts for a reply.
Round budget and application intake inputs, and reviewer drafts on both reads and
writes, use decimal EUR strings such as `"123.45"`.

Missing budgets, requested amounts, and budget-dependent remaining amounts are
`null`, not zero. Totals disclose unknown requests. An outdated recommendation
retains its allocation until explicitly reconsidered; compare its recorded
application version with the current application version.
