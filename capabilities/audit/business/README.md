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

[Recommendation saves](../../recommendations/business/src/server/commands/recommendations.ts)
are the first integration. Each successful save records `recommendation.saved`,
including the first recommendation. The target identifies the recommendation by
its application's permanent ID and its recommendation revision. Full recommendation
content and its evidence basis remain in Recommendations' version history. Rejected
saves produce no event. Existing recommendation behavior is preserved: every
successful save advances its revision, even if the submitted values are unchanged.

The shared trail starts when this integration is deployed. Existing history is
not backfilled, and other actions continue using their capability-owned histories.
An empty shared trail does not establish that no earlier activity occurred.

There is no shared audit-reading API, web screen, or MCP tool yet. Add an authorized
reader with its consuming workflow. Capability-owned history remains available
through existing interfaces.

## Protect and retain events

The recorder needs `INSERT` on `audit_events`. Database triggers
reject updates and reject deletion unless the event belongs to an expired demo.
They do not protect against a database owner disabling triggers or truncating a
table. Ordinary workspaces retain their events; no general retention or external
export service is implemented.

Operator cleanup uses `removeDemoAudit` from `@merit/audit/server/demo` in the
organization lifecycle transaction before deleting the workspace. It checks demo
kind and expiry and requires separate delete privileges. Application assembly owns
the cleanup sequence. See [deployment privileges](../../../docs/guides/deployment.md#check-runtime-privileges).

Package tests cover the recording format at the shared 100% coverage thresholds.
[Database tests](tests/audit.integration.ts) exercise attribution, rollback, and
immutability. Recommendation integration tests verify that the business change,
version, and shared event commit or roll back together, including when an injected
recorder fails after appending its event.
