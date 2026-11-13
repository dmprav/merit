# Record workspace activity

`@merit/audit` owns the append-only `audit_events` store. Organizations, Contacts,
Applications, Rounds, Reviews, and Recommendations own the meaning of their events
and the authorization for their commands and history views. Business versions and
command receipts remain separate: evidence and judgment versions describe what was
considered; receipts make retries safe; events explain what happened.

## Record an accepted action

Call `recordAuditEvent` from `@merit/audit/server/record` with the command's existing
transaction after authorization and validation. Keep the business locks until
commit, and propagate recording errors so the state change, receipt, and event
roll back together. The recording entry validates the envelope and snapshots the
actor's name when the caller does not supply one. It does not authorize commands
or start another transaction. Callers import this writer directly; rollback tests
reject an audit insert or fail a deferred database trigger at commit.

The envelope contains the workspace, action, actor identity and recorded name,
web or verified MCP provenance, target type and ID, target revision, recorded target
name, historical round/application/assignment context, time, and payload format
version. Context IDs and names are historical facts and have no live-record foreign
keys. Deleting or renaming a subject does not erase or rewrite them. Unknown seed
provenance stays null; it is never invented as web activity.

Capabilities construct typed details from their validated domain values and own
reading those payloads. Intake additionally uses its independent
[frozen snapshot codec](../../applications/business/src/server/persistence/history-encoding.ts).
The envelope's `formatVersion` starts at 1 and is independent of concurrency and
business version numbers. Changing a stored payload after deployment requires an
explicit reader strategy; never reinterpret old facts using new live state.

| Owner           | Events                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organizations   | `organization.created`, `organization.renamed`; `team_invitation.issued`, `.replaced`, `.revoked`, `.accepted`; `membership.access_changed`, `.removed`                                                                                                                      |
| Contacts        | `contact.created`, `.updated`, `.archived`, `.restored`                                                                                                                                                                                                                      |
| Applications    | `application.created`, `.material_changed`, `.marked_ready`, `.summary_changed`, `.contact_changed`, `.revision_recorded`, `.correction_recorded`, `.deleted`; `application_working_revision.started`, `.updated`, `.discarded`                                              |
| Rounds          | `round.created`, `.details_changed`, `.budget_changed`, `.criteria_changed`, `.manager_changed`, `.deleted`                                                                                                                                                                  |
| Reviews         | `review_request.created`, `.cancelled`; `review_assignment.invited`, `.invitation_renewed`, `.accepted`, `.declined`, `.withdrawn`, `.conflict_reported`, `.conflict_cleared`, `.access_ended`, `.reinstated`; `assessment.recorded`, `.corrected`, `.submitted`, `.amended` |
| Recommendations | `recommendation.recorded`                                                                                                                                                                                                                                                    |

Record each accepted fact once. One command may change several facts, such as
cancelling a review request and ending its assignment. A reviewer submission is a
single assessment event visible in both assignment history and workspace activity.
Rejected writes, command replays, and unchanged saves append nothing. Recommendation
identity includes the author and application basis as well as its content. Private
reviewer drafts and email delivery attempts are operational state, not audit events.
Shared application working revisions are persisted collaborative work and are audited.

Application and round creation receipts survive eligible deletion in their own
tables. Reviewer command receipts hold the result revision separately from events. Owning
commands record receipts explicitly alongside their business writes; event builders
only describe and append facts.
Round budget rules use `budgetEstablished`, not a scan of historical events.

## Read workspace activity

`readWorkspaceActivity` from `@merit/audit/server/read` is a trusted storage entry.
Its caller must authorize the workspace and supply the permitted target types.
It returns at most 50 compact envelopes, newest first by `(recorded_at, id)`, with
a keyset cursor and recorded-person and historical-round filters. Details are not
selected for this feed. The store has indexes for workspace time, subject revision and time,
round time, actor time, and assignment history.

[Grantmaking's reader](../../grantmaking/business/src/server/queries/activity.ts)
checks current grant-work access and limits events to grant subjects. Team history
checks team administration and selects only organization, invitation, and membership
subjects. Contact and reviewer histories retain their existing access checks.
There is no universal client-facing endpoint that grants access to every event.

`readAuditHistory` from `@merit/audit/server/read` supplies bounded subject history
with the same newest-first cursor. Call it inside the capability's authorized read
transaction, specifying permitted target types and the subject or assignment.
`auditPageInput` from `@merit/audit/api` validates cursors and limits (20 by default,
at most 50). Event payload interpretation remains with the owning capability.

Browser contact and reviewer histories load when opened. Application, budget and
team pages carry a bounded initial history; older entries load through their
capability's authorized reader. A failed page read can be retried, and a denied
read removes previously displayed history. Reviewer assignment lists contain
summaries and do not query history for every assignment.

Authorized capability readers may still use `@merit/audit/schema` for compact
projections and individual event content with an organization and subject scope. The workspace feed resolves
current titles and links only for the selected page; recorded subject names remain
available after deletion, and the round filter continues to include deleted records.
Unknown action names within a permitted subject type remain readable.

## Protect and retain events

The runtime needs `INSERT` and `SELECT` on `audit_events`. Database triggers reject
updates and deletion except for expired demo cleanup. These protect ordinary
runtime operations, not a database owner disabling triggers or truncating tables.
Ordinary workspace history has no automatic expiry or external export service.

`removeDemoAudit` from `@merit/audit/server/demo` checks demo kind and expiry and
runs before deleting the workspace in the lifecycle transaction. Cleanup requires
separate delete privileges; see [deployment privileges](../../../docs/guides/deployment.md#check-runtime-privileges).
Audit depends only on Auth and DB in production. The baseline SQL installs the
organization foreign key without introducing a reverse Organizations dependency.

This is an undeployed baseline replacement. Create a fresh disposable development
database to use it; applying the baseline over an existing database is not a data
migration. The baseline also retains the hand-written deferred version references,
content constraints, and immutability triggers. No historical backfill or parallel
legacy writer is needed before the first deployment.

## Verify the contract

Package tests cover the envelope and activity cursor at the shared coverage
thresholds. [Database tests](../../organizations/business/tests/audit.integration.ts) cover attribution,
transaction rollback, immutability, scopes, ordering, and paging. Capability tests
cover authorization and domain payloads. Grantmaking's
[recording tests](../../grantmaking/business/tests/audit-recording.integration.ts)
and [activity tests](../../grantmaking/business/tests/workspace-activity.integration.ts)
verify atomic writes, no-op and retry behavior, and retained historical context.
