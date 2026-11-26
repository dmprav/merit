# Organizations business capability

Organizations owns workspace provisioning, membership, invitations, access
requests, and demo workspace lifecycle. The [operator guide](../../../docs/guides/organizations.md)
and [team workflow](../../../docs/workflows/manage-team.md) explain the behavior.

## Source ownership

| Source                                                  | Responsibility                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `domain/`                                               | Membership decisions and invitation eligibility, without I/O.                |
| `api/commands.ts`                                       | Provisioning, invitation, membership, and access-request inputs and results. |
| `api/queries.ts`                                        | Workspace, organization, team, invitation, and history read shapes.          |
| `api/identifiers.ts`, `api/records.ts`, `api/result.ts` | Definitions shared by commands and queries.                                  |
| `api/service.ts`                                        | The explicit browser-safe service interface used by web and MCP.             |
| `server/commands/`                                      | Authorization, transaction ownership, changes, and invitation delivery.      |
| `server/queries/`                                       | Authorized reads and public result assembly.                                 |
| `server/persistence/commands/`                          | Locks, decision-state reads, and writes in the caller's transaction.         |
| `server/persistence/queries/`                           | Consumer reads and pagination SQL.                                           |
| `server/persistence/`                                   | Schema, shared SQL predicates and lookups, and cross-capability scopes.      |
| `server/service.ts`                                     | Binds commands and queries to the public interface.                          |
| `server/demo.ts`                                        | Trusted demo creation, reset, entry limits, and cleanup.                     |

The [architecture checks](../../../docs/guides/architecture-checks.md) enforce
the dependency directions between these roles.
Public identifiers and result shapes are independent of database tables and
inferred server return types.

## Transactions and integration entries

Every independent workspace, organization, invitation, access-request, and team
query uses a read-only, repeatable-read transaction. Team reads evaluate access
and assemble members and invitations from the same snapshot. Team history has a
separate paginated read that checks current administration access. Queries
inside a caller-owned transaction use savepoints and preserve its mode and rollback.
The [query integration tests](tests/query-access.integration.ts) exercise both
PostgreSQL's write rejection and caller-owned rollback.

Commands lock the organization and current membership before changing access.
Membership changes, invitation changes, and audit events commit together.
The required `revokeReviewAccess` collaborator ends review assignments in that
transaction when qualifying responsibilities are removed. Assembly supplies Reviews’
implementation; Organizations never writes review tables.
Invitation delivery runs after the invitation transaction completes, in the
[`organization-invitation:<invitationId>` workflow](src/server/organization-invitation.workflow.ts)
that Organizations owns. Its [activities](src/server/commands/delivery.ts) reread the invitation
before every attempt and stop once it is revoked, accepted, or expired. They send through
`sendInvitation` and record the outcome with `recordDelivery` in a separate transaction. Reads and
the outcome use the invitation's token-hash scope, so they need no organization identifier and
continue while the inviter's access changes; `recordDelivery` never overwrites `sent` with `failed`. The
invitation stays `pending` during about fifteen minutes of automatic retries, then becomes `failed`.
Requests wait about five seconds, polling Postgres, for the first outcome. The raw token is the only
sensitive workflow input, protected by the payload codec. The issuance transaction stores the
verification hash and a token encrypted for this invitation ID. The worker can recover a lost
handoff on startup or on the next reconciliation pass. An acknowledged handoff clears the
encrypted token, and reconciliation discards obsolete handoffs. Retrying the same creation request preserves its invitation and does not
send it again. `/server/testing` supplies an inline stand-in for the workflow in business tests.

[Invitation issuance](src/server/commands/issue-invitation.ts) checks delivery limits,
constructs a complete invitation, and stores it in the caller's transaction.
Provisioning selects owner and program-manager responsibilities; team operations
supply the requested responsibilities or retain those of the invitation being
replaced. The operation returns the issued record and its token for delivery after
commit. [Command coordination](src/server/commands/service.ts) sends that result
without reconstructing or patching it. The token stays private to issuance and
delivery. Acceptance continues to look up the token by its hash.

`@merit/organizations/schema` supports cross-capability joins.
`@merit/organizations/scope` supplies read predicates.
`@merit/organizations/locks` publishes the [grant-work lock order](src/server/persistence/commands/locks.ts)
for approved grantmaking and contacts commands. Query roles cannot import this
locking entry. These entries support coordination while organizations retains
responsibility for membership writes; import checks alone do not enforce table
write ownership.
`@merit/organizations/server/demo` is a separate trusted lifecycle entry; ordinary
commands and queries cannot call it. Demo seeds and removal callbacks execute
inside the lifecycle transaction so capability content and workspace records
commit or roll back together.

`@merit/organizations/server/assistant` owns administrator opt-in and storage
for a member’s private conversations. The assistant runtime owns the contents
of each checkpoint and checks the permissions needed to disclose those contents.
Storage rechecks workspace membership, its original identity, and conversation
ownership. A locked callback rechecks consent and commits the checkpoint with
the business operation. A competing or stale revision cannot execute that
callback. The worker discovers running conversation addresses through a bounded
database function and opens each conversation under its owner’s current scope.
Workspace deletion cascades to conversations and consent.
