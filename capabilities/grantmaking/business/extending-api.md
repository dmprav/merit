# Extend grant-work APIs

Place a change with the capability that owns its business rules and persisted state.
The [ownership map](README.md) explains the split. Each business package has pure
`domain/` rules, browser-safe `api/` contracts, authorized `server/commands/`, and
private persistence. Web and MCP call the same operations through services composed
in [application assembly](../../../app/src/server/services.server.ts).

## Choose the owner

| Change                                                                         | Owner and starting point                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Round configuration, budget, criteria, manager responsibility                  | [Rounds](../../rounds/business/README.md)                   |
| Application identity, intake, material, readiness, summary, contact assignment | [Applications](../../applications/business/README.md)       |
| Review requests, assessments, reviewer access, private drafts, submission      | [Reviews](../../reviews/business/README.md)                 |
| Manager proposal, allocations, recommendation versions, audit                  | [Recommendations](../../recommendations/business/README.md) |
| Combined reads, history presentation, personal navigation, fictional examples  | This package                                                |

Define inputs and typed outcomes in the owner's API. Its service factory binds
infrastructure and receives the current actor on every call. Transports resolve
identity, parse input, and present outcomes. They do not coordinate database writes.

## Preserve transaction and version guarantees

Commands own transactions. They acquire workspace, round, case, and current account
or membership locks before checking revisions and applying a domain transition.
Application commands expose the shared [case lock](../../applications/business/src/server/persistence/locks.ts)
for downstream review and recommendation work. Reviewer participation keeps its
assignment-based authority distinct from a manager's workspace authority.

A collaborator supplied by assembly uses the command's transaction and already-held
locks. It must not open an independent connection or commit. Rounds asks whether a
round contains applications; Applications asks whether review or recommendation work
prevents deletion. Any review request, including a cancelled request, blocks deletion.
These callbacks avoid dependencies from upstream owners to downstream implementations.

Applications decides whether intake changed and owns material, draft, and case writes.
Its [history codec](../../applications/business/src/server/persistence/history-encoding.ts)
records intake-only before and after snapshots in the same transaction. The
[usage adapter](src/server/persistence/commands/application-work.ts) checks whether
downstream judgments prevent deletion. An unchanged save keeps its revision and
creates no history. Creation receipts remain available after eligible deletion.

Reviews owns its concurrency revision in `review_states`. Recommendations derives its
current revision from immutable `recommendation_versions`; a case lock serializes
comparison and append. Recommendation audit recording uses the same transaction.
No caller should update another capability's tables directly. Trusted example seeding
uses explicit owner entry points; combined queries use approved schema and scope exports.

## Compose reads and encoding

Grantmaking's [queries](src/server/queries) assemble round and application views from
owned projections. Independent queries use a read-only, repeatable-read transaction.
Inside an existing transaction, they preserve its mode and rollback behavior.
Shared schema, SQL projections, locks, and stored encoding remain independent of
command and query handlers.

Each owner keeps public encoding separate from stored encoding. Public fields are
selected deliberately; future API additions must not silently rewrite old history.
The combined [public encoding](src/api/encoding.ts) and
[stored encoding](src/server/persistence/encoding.ts) remain here for composed records.
An `ApplicationRecord` is a reading view, not an input for saving all its parts.

## Verify the boundary

Run the changed owner's complete test suite and the affected composition tests.
Pure tests establish transitions and JSON contracts; integration tests establish
permissions, lock ordering, revisions, retries, immutable history, and rollback.
Cross-workflow scenarios remain in [grantmaking integration tests](tests) and
[app integration tests](../../../app/tests).

The [architecture checks](../../../docs/guides/architecture-checks.md) enforce
public exports, dependency direction, browser/server separation, and source roles.
A new server export needs an explicit consumer permission and positive and negative
fixtures. Keep command persistence separate from query persistence. Follow the
[verification guide](../../../docs/guides/verification.md) for full-workspace checks.
