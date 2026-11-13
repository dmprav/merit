# Work with Merit through MCP

Connect an OAuth-capable Streamable HTTP client to `/mcp/workspace`. MCP supports
workspace grant work, reviewer participation, contacts, team operations, personal
shortcuts, onboarding, and operator administration through the same services as the website.
The browser demo remains public; there is no anonymous MCP endpoint.
For Clerk configuration, live access checks, and authentication troubleshooting,
use [MCP operations](mcp-operations.md).

## Connect and find your work

1. Add `http://localhost:3000/mcp/workspace` to a locally reachable client, or use
   the deployed site's origin. See [local development](development.md).
2. Sign in and grant the client the access it needs. Website cookies do not
   authenticate MCP. Workspace tools require current membership; personal reviewer assignments,
   onboarding, and operator administration use their own authority checks.

Start with the tools for your task. Each uses its own [client grants](#choose-client-access)
and current Merit permissions; workspace discovery is needed only for workspace work.

| Task                    | Start with                                                                                    | Continue with                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Grant or team work      | `list_workspaces`, then `list_funding_rounds` or `get_team` with the returned `workspaceSlug` | [Read context](#read-the-context-you-need) and [edit](#edit-and-recover) |
| Your review assignments | `list_my_reviews`, then `get_reviewer_assignment`                                             | [Participate in reviews](#participate-in-and-manage-reviews)             |
| Join a workspace        | `get_membership_invitation` with the token from your invitation                               | [Onboarding](#personal-shortcuts-onboarding-and-administration)          |
| Your shortcuts          | `get_navigation_pins`                                                                         | [Personal shortcuts](#personal-shortcuts-onboarding-and-administration)  |
| Your account's demo     | `get_demo`                                                                                    | [Demo access](#personal-shortcuts-onboarding-and-administration)         |
| Operator administration | `list_organizations` or `list_access_requests`                                                | [Administration](#personal-shortcuts-onboarding-and-administration)      |

No operator database lookup is needed. Discover the workspace slug and record IDs
through the read tools. Workspace slugs identify organizations to clients; rounds
and applications use the same permanent IDs across MCP, web, and storage, as
described in the [business model](../../capabilities/grantmaking/business/README.md#records-and-reading-views).
Tool discovery includes input schemas, success output schemas, and explanations of the required versions and
monetary formats. Text and structured results carry the same validated data.

## Choose client access

| OAuth grant                      | Allows, subject to current Merit permissions                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `workspace:read`                 | Workspace discovery, rounds, applications, manager assignment views, contacts, and team reads                     |
| `grants:write`                   | Round preparation, intake, reviews, reviewer invitations and assignment management, recommendations, and contacts |
| `team:write`                     | Member invitations and membership changes                                                                         |
| `reviews:read`                   | Your reviewer assignments, assigned evidence, private drafts, and submissions                                     |
| `reviews:write`                  | Accept/decline assignments, report conflicts, save private drafts, submit and amend your assessments              |
| `profile:read` / `profile:write` | Read / change your navigation pins                                                                                |
| `onboarding:read`                | Read membership invitations and your account's demo status                                                        |
| `onboarding:write`               | Request workspace access, accept membership invitations, start and reset your account's demo                      |
| `admin:read` / `admin:write`     | Read / manage organizations, initial-owner invitations, and access requests as a Merit operator                   |

Grant only the access the client needs. Existing workspace grants do not authorize
private reviewer work, personal settings, onboarding, or operator administration.
Team administration still requires current owner or administrator authority;
operator tools require a configured Merit operator. There are no independent agent
accounts: every call acts for the authenticated person. Sign-in and OAuth consent
remain outside the tools; no anonymous MCP access is available.

The server verifies OAuth identity and client ID on each request, then checks the
required grant for each tool. Shared application operations recheck current
membership and authority. Knowing an ID, retaining an old token, or supplying a
person's identity in tool arguments does not grant workspace access.

## Read the context you need

Lists default to 20 records and accept a `limit` from 1 to 50. Follow `nextCursor`
by passing it as `after` until it is `null`. Lists use stable identifier order,
not title or date order. Access requests use normalized email order.
Personal pins return their complete saved order rather than a paginated list. These are live reads: changing a title does not move a
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

To catch up on recent changes across a workspace, call `list_workspace_activity`.
It returns who changed shared grant work, newest first, in pages of up to 50
entries; pass `nextCursor` as `after` until it is `null`. Optional `roundId` (the round,
its applications, and their assessments and recommendations) and `personId` filters
narrow the list, as on the web; take person IDs from the returned `people`, and keep
the same filters while following a cursor. Each entry carries the
recorded person's name, web or MCP-client provenance, a stored action name, and the
record's current title and browser link, or a null record that no longer exists.
Only current program managers can read it. Edits that stay in an application's or
round's own history are not listed; read the history listings for those. The
[workflow](../workflows/review-and-decide.md#catch-up-on-shared-changes) lists what
is recorded.

Fetch longer material through `get_application_content` or
`get_funding_round_content`. Choose a named section from the tool's input schema.
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

Contact history is separate from contact details. `list_contact_history` returns
newest-first pages; pass `nextCursor` as `after` to read older changes. `list_contact_applications`
shows applicant and reviewer associations, including historical review use. `get_team` returns workspace and
permission context; members, pending invitations, and access history have separate
list tools. `list_team_history` also uses a newest-first time cursor. Invitations
and access history require current administrative authority.
`get_team_event` reads an immutable event's JSON details with explicit continuation.
Manager candidates are active team members with program-manager responsibility;
the save operation still checks their eligibility.

## Edit and recover

| Work              | Tools                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Prepare rounds    | `create_funding_round`, `edit_funding_round`, `delete_funding_round`                                                      |
| Record intake     | `create_application`, `edit_application`, `select_application_contact`, `mark_application_ready`, `delete_application`    |
| Revise intake     | `start_application_revision`, `save_application_revision`, `publish_application_revision`, `discard_application_revision` |
| Review            | `request_review`, `cancel_review_request`, `record_assessment`, `correct_assessment`                                      |
| Recommend         | `save_recommendation`                                                                                                     |
| Maintain contacts | `create_contact`, `update_contact`, `archive_contact`, `restore_contact`                                                  |
| Manage a team     | `invite_member`, `resend_member_invitation`, `revoke_member_invitation`, `change_member`, `remove_member`                 |

Read before editing. Preserve the original preconditions until the save succeeds:

| Command                                                   | Preconditions                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Round edit or deletion                                    | `expectedPreparationRevision` from `round.preparationRevision`                            |
| Intake, revisions, readiness, deletion, contact selection | `expectedIntakeRevision` from `application.intakeRevision`                                |
| Recommendation                                            | `expectedRecommendationRevision` and `expectedApplicationVersion`                         |
| Review request or assessment                              | `expectedReviewRevision`, `expectedApplicationVersion`, `expectedCriteriaVersion`         |
| Contact edit, archive or restore                          | `expectedContactRevision` from the contact's `contactRevision`                            |
| Member change or removal                                  | `expectedMembershipId`, `expectedMembershipVersion`, and complete `expectedInvitationIds` |

Application preconditions come from `get_application`. Member versions come from
`list_team_members`; collect all pending invitations issued by that person with
`list_team_invitations`, filtering `issuedBy` and following continuation. If these
facts change before the write, the operation rejects the stale request. Contact
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
applicable. A successful invitation replacement returns the new and replaced IDs.
Reissuing an invitation replaces the old invitation, so reread pending invitations
after response loss.
Invitation delivery happens after commit; inspect delivery status and use resend
to recover a failed email. Review requests only track work and send no messages.

Requested edits save directly, including budget changes with their required reason.
There is no additional web-confirmation step. Ask for suggestions when no save is
intended; client conversations are outside Merit's verification boundary. Saving a
recommendation does not commit funding. Publishing a working intake revision makes that correction or revision current;
public publication and funding decision recording are not implemented in either interface.

## Participate in and manage reviews

An external reviewer can connect without workspace membership. Use `list_my_reviews`
and `get_reviewer_assignment` to find and read your assignments. The assignment read
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
events, newest first, following `nextCursor` as `after`. Both reads check current
access and exclude private drafts.

`save_reviewer_draft` saves against `draft.revision` as `expectedDraftRevision`.
Amounts are decimal EUR strings. `submit_reviewer_assessment` submits that saved
revision and notifies the manager. To amend, save a new draft with an explanation
in `draft.note`, then submit it. Retain the same command ID and original revision
on retries. Read the assignment to check notification status after submission.

Managers use `list_application_reviewers`, `invite_reviewer`, and
`manage_reviewer_assignment`. Create a review request first, then invite its
contact. Unlike `request_review`, `invite_reviewer` sends email. Management actions
end or reinstate access, clear conflicts with a reason, resend invitations, or retry
submission notifications. Clearing a conflict requires the reviewer to accept again.
These tools preserve the [reviewer workflow](../workflows/participate-in-review.md).

## Personal shortcuts, onboarding, and administration

`get_navigation_pins` and `change_navigation_pin` read and change your personal
shortcuts. Pinning grants no access. Moving a shortcut names its neighbour in the
same section, or uses `before: null` to move to the end. Changes are safe to retry.

Use `get_membership_invitation` with the token from an invitation link to read the
offered organization responsibilities, then `accept_membership_invitation` to join.
Acceptance requires the invited verified email and preserves disabled-account and
revoked-invitation checks. `request_workspace_access` records a request to explore
the prototype; it sends no email and grants no access.

`get_demo` reads your account's demo without creating it. `start_demo` resumes an
active copy or creates one; use `fresh: true` after expiry. To replace all demo
progress, call `reset_demo` with `resetWorkspaceId` from `get_demo`. Keep that ID
on retries so the replacement cannot be reset again accidentally. These operations
use the same seeding, seven-day expiry, and rate limits as the browser. They never
use anonymous browser cookies. An empty or expired read is a successful status
lookup; an expired start, rate limit, or unavailable operation is a tool error.

Operators use `list_organizations`, `get_organization`, `create_organization`,
`rename_organization`, `replace_owner_invitation`, and `revoke_owner_invitation`.
Creation sends an initial-owner invitation; reuse `requestId` on retry and inspect
the organization's delivery status. Replacing an invitation also resends it and
invalidates the previous link, so read current status before retrying. These tools
do not grant operators workspace membership. `list_access_requests` and
`review_access_request` support triage without sending messages or granting access.

## Understand attribution

Changes record the person, timestamp, and interface. MCP changes also record the
verified OAuth client ID. Web history displays that provenance alongside the actor;
MCP reads return it as structured data. Client-supplied names are not trusted as
identity. Earlier records without provenance are shown as not recorded.

Provenance establishes who acted and through which client. It does not establish
whether an AI generated the content or whether a human reviewed each action.

## Monetary values

Round and application amounts, and recommendation allocations, use exact values such as
`{ "minorUnits": "12345", "currency": "EUR" }` for €123.45. Parse minor units
as integers, never floating point. Round budget, application intake, and received
assessment inputs use decimal EUR strings such as `"123.45"`. Reviewer drafts and
assessment content also use decimal EUR strings, including in reads. Tool descriptions
and schemas identify the required format. Precision beyond two decimal places is rejected.

Missing budgets, requested amounts, and budget-dependent remaining amounts are
`null`, not zero. Totals disclose unknown requests. An outdated recommendation
retains its allocation until explicitly reconsidered; compare its recorded
application version with the current application version.
