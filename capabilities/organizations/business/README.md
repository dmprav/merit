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
the production directions, including type imports; API definitions share one pure role. Commands cannot depend on consumer
queries; queries cannot depend on writes. The small server support modules define
injected dependencies, operator authorization, result handling, and token hashing.
They cannot import handlers, persistence, or service assembly.

Public service types come from `@merit/organizations/api`. Public identifiers and
result shapes are independent of database tables and inferred server return types.
Colocate focused tests with their behavior and keep persisted scenarios in `tests/`.
Tests may compose local layers regardless of placement; cross-package access rules
still apply.

## Transactions and integration entries

Every independent workspace, organization, invitation, access-request, and team
query uses a read-only, repeatable-read transaction. Team reads evaluate access
and assemble members, invitations, and history from the same snapshot. Queries
inside a caller-owned transaction use savepoints and preserve its mode and rollback.
The [query integration tests](tests/query-access.integration.ts) exercise both
PostgreSQL's write rejection and caller-owned rollback.

Commands lock the organization and current membership before changing access.
Membership changes, invitation changes, and audit events commit together.
Invitation delivery runs after the invitation transaction completes; failed
sending leaves the saved invitation recoverable. Delivery status is recorded in
a separate transaction. Retrying the same creation request preserves its
invitation and does not send it again.

[Invitation issuance](src/server/commands/issue-invitation.ts) checks delivery limits,
constructs a complete invitation, and stores it in the caller's transaction.
Provisioning selects owner and program-manager responsibilities; team operations
supply the requested responsibilities or retain those of the invitation being
replaced. The operation returns the issued record and its token for delivery after
commit. [Command coordination](src/server/commands/service.ts) sends that result
without reconstructing or patching it. The token stays private to issuance and
delivery; only its hash is stored.

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
