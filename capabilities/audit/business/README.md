# Record workspace activity

`@merit/audit` owns a compact, append-only record of workspace actions. Business
capabilities own the action's meaning, authorization, and detailed history. Audit
entries identify the actor, their name at the time, web or verified MCP provenance,
the action, and the affected record and revision.

## Record an accepted action

Application assembly supplies `recordAuditEvent` from `@merit/audit/server/record`
through the consuming capability's recording contract. The command passes its
existing database transaction, authorizes the action, obtains the actor's current
identity, and retains its locks until commit. Audit validates the event format and
appends the entry; it neither opens another transaction nor repeats the owning
capability's business rules. The recorder must propagate failures so the business
change and audit entry roll back together.

Each successful write records one event in its own transaction; rejected or
conflicting writes record none. Capabilities declare the narrow event they record
and receive the recorder through assembly, as Recommendations does.

| Capability                                                                               | Action                                                                              | Target (type, ID, revision)                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Applications](../../applications/business/src/server/commands/intake.ts)                | `application.create`, `.mark_ready`, `.revision`, `.correction`, `.delete`          | application, public ID, case revision                                    |
| [Rounds](../../rounds/business/src/server/commands/preparation.ts)                       | `round.create`, `.budget`, `.criteria`, `.manager`, `.delete`                       | round, public ID, round revision                                         |
| [Reviews](../../reviews/business/src/server/commands/reviews.ts)                         | `assessment.recorded` for each saved assessment version, including a manager's edit | assessment, assessment ID, version                                       |
| [Reviewer submissions](../../reviews/business/src/server/commands/reviewer.ts)           | `assessment.submitted` for each submitted or amended assessment                     | assessment, assessment ID, version                                       |
| [Recommendations](../../recommendations/business/src/server/commands/recommendations.ts) | `recommendation.saved`, including the first save                                    | recommendation (its application's permanent ID), recommendation revision |

Application actions are the stored case action names. Content and detail saves,
working revisions, round detail edits, review requests, reviewer drafts,
invitations, contacts, and team changes remain in their own histories. Creation is
revision zero. Unchanged saves keep their revision and record nothing, except
recommendations, which advance their revision on every successful save even if the
submitted values are unchanged. Full content stays with the owning capability.

## Read workspace activity

`readWorkspaceActivity` from `@merit/audit/server/read` returns a workspace's events
newest first (`recorded_at`, then `id`) for current program managers, with a keyset
cursor and at most 50 events per page. It returns `not_found` for a workspace the
person cannot see and `forbidden` for a member who does not work on grants. It can
narrow results to one recorded person and to a set of target records, and it lists
everyone with recorded activity so callers can offer a person filter.

Audit imports no capability, so it cannot know which applications a round holds or
what a record is called. The caller supplies target sets and resolves titles:
[grantmaking's `listWorkspaceActivity`](../../grantmaking/business/src/server/queries/activity.ts)
composes round membership, assessment-to-application links, and current titles, and
serves the Activity page and the `list_workspace_activity` MCP tool. Events for
records that no longer exist remain; callers present them without a link.

## Protect and retain events

The recorder needs `INSERT` and the reader `SELECT` on `audit_events`. Database triggers
reject updates and reject deletion unless the event belongs to an expired demo.
They do not protect against a database owner disabling triggers or truncating a
table. Ordinary workspaces retain their events; no general retention or external
export service is implemented.

Operator cleanup uses `removeDemoAudit` from `@merit/audit/server/demo` in the
organization lifecycle transaction before deleting the workspace. It checks demo
kind and expiry and requires separate delete privileges. Application assembly owns
the cleanup sequence. See [deployment privileges](../../../docs/guides/deployment.md#check-runtime-privileges).

Package tests cover the recording format and activity cursor at the shared 100%
coverage thresholds. [Database tests](tests/audit.integration.ts) exercise
attribution, rollback, immutability, and the reader's access, order, paging, and
filters. Grantmaking's [recording tests](../../grantmaking/business/tests/audit-recording.integration.ts)
and [activity tests](../../grantmaking/business/tests/workspace-activity.integration.ts)
verify that each business change and its event commit or roll back together,
including when an injected recorder fails after appending its event, and that
rejected writes record nothing.
