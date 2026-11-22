# Extend grant-work APIs

Place a change with the capability that owns its business rules and persisted state.
The [ownership map](README.md) explains the split. Each business package has pure
`domain/` rules, browser-safe `api/` contracts, authorized `server/commands/`, and
private persistence. Web and MCP call the same operations through services composed
in [application assembly](../../../app/src/server/services.server.ts).

## Call the owner

Define inputs and typed outcomes in the owner's API. Its service factory binds
infrastructure and receives the current actor on every call. Web and MCP handlers
call the named owner, such as `recommendations.saveRecommendation` for a proposal
or `grantmaking.readApplicationPage` for a combined view. Transports resolve
identity, parse input, and present outcomes. They do not coordinate database writes.

## Preserve transaction and version guarantees

Commands own transactions. They acquire workspace, round, case, and current account
or membership locks before checking revisions and applying a domain transition.
Application commands expose the shared [case lock](../../applications/business/src/server/persistence/commands/locks.ts)
for downstream review and recommendation work. Reviewer participation keeps its
assignment-based authority distinct from a manager's workspace authority.

A collaborator supplied by assembly uses the command's transaction and already-held
locks. It must not open an independent connection or commit. Rounds asks whether a
round contains applications; Applications asks whether review or recommendation work
prevents deletion. These callbacks avoid dependencies from upstream owners to
downstream implementations.

No caller should update another capability's tables directly. Trusted example seeding
uses explicit owner entry points; combined queries use approved schema and scope exports.

## Compose reads and encoding

Grantmaking's [queries](src/server/queries) assemble round and application views from
owned projections. Independent queries use a read-only, repeatable-read transaction.
Inside an existing transaction, they preserve its mode and rollback behavior.
Shared schema, SQL projections, locks, and stored encoding remain independent of
command and query handlers.

For application overviews, join the named facts from Recommendations and Reviews
through their `/scope` exports. Grantmaking combines these facts into work filters.
After Grantmaking authorizes the case, Reviews selects the same current entries
for overview counts and paginated review summaries. Recommendations resolves an
exact revision and its predecessor for the application history view. Both readers
use the caller's transaction. Fetch display facts after pagination unless a filter
or sort needs them earlier.
The round page and bounded overview share the [round totals projection](src/server/persistence/queries/round-totals.ts).
The page also counts active review work and the criteria used by historical reviews.

Each owner keeps public encoding separate from stored history encoding. Public fields are
selected deliberately; future API additions must not silently rewrite old history.
The combined [record encoding](src/domain/encoding.ts) remains here for composed records.
An `ApplicationRecord` is a reading view, not an input for saving all its parts.

## Verify the boundary

Run the changed owner's complete test suite and the affected composition tests.
Pure tests establish transitions and JSON contracts; integration tests establish
permissions, lock ordering, revisions, retries, immutable history, and rollback.
Cross-workflow scenarios remain in [grantmaking integration tests](tests) and
[app integration tests](../../../app/tests).

The [architecture checks](../../../docs/guides/architecture-checks.md) enforce
public exports, dependency direction, browser/server separation, and source roles.
A new non-standard server export needs an explicit consumer permission and positive
and negative fixtures. Keep command persistence separate from query persistence. Follow
the [verification guide](../../../docs/guides/verification.md) for full-workspace checks.
