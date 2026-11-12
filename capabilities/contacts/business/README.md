# Contacts business capability

Contacts owns workspace profiles, their revision history, and archival and
restoration. The [contact workflow](../../../docs/workflows/manage-contacts.md)
defines the behavior shared by web and MCP.

## Source ownership

| Source                         | Responsibility                                                             |
| ------------------------------ | -------------------------------------------------------------------------- |
| `domain/`                      | Profile identity and validation, independent of transport and persistence. |
| `api/commands.ts`              | Create, update, archive, and restore inputs and their results.             |
| `api/queries.ts`               | Directory, summary, detail, and history inputs and results.                |
| `api/records.ts`               | Public record and history shapes shared by commands and queries.           |
| `api/service.ts`               | The browser-safe service interface used by web and MCP.                    |
| `server/commands/`             | Authorization, revision checks, transaction ownership, and changes.        |
| `server/queries/`              | Authorized reads and public result assembly.                               |
| `server/persistence/commands/` | Writes using the transaction supplied by their caller.                     |
| `server/persistence/queries/`  | Directory, detail, pagination, and history SQL.                            |
| `server/persistence/`          | Private schema and authorized contact lookup shared with grant work.       |
| `server/service.ts`            | Binds the database and grant-work dependency to the service interface.     |

The [architecture checks](../../../docs/guides/architecture-checks.md) enforce
the production dependency directions, treating the browser-safe API as one role. Command code can read the state needed to decide a
change; it cannot depend on consumer queries. Public service types come from
`@merit/contacts/api`, independently of server implementations.

Colocate focused tests with the behavior they explain, and keep persisted scenarios
such as the [query transaction checks](tests/query-access.integration.ts) in
`tests/`. Tests and shared fixtures may compose local layers regardless of their
placement; public package access and cross-capability server permissions still apply.

## Coordinate grant work

Application assembly supplies the [grant-work interface](src/server/grant-work.ts).
Contacts owns the profile change; grantmaking owns application titles and
outstanding review requests. Archival checks run in the contact command's
transaction under the organization-owned grant-work lock imported from
`@merit/organizations/locks`. Profile changes and
history commit together, and unchanged edits preserve the revision.

Every independent query uses a read-only, repeatable-read transaction. Directory
profiles, history, and application titles are read from that same snapshot.
Queries invoked inside a caller-owned transaction use a savepoint and preserve
its mode and rollback behavior.

`@merit/contacts/schema` supports cross-capability joins. `@merit/contacts/scope`
provides an organization-scoped lookup whose caller must first authorize grant
work. Neither entry transfers ownership of contact writes. The trusted
`@merit/contacts/server/demo` entry seeds and removes fictional contacts using its
caller's transaction. Ordinary command and query code cannot invoke that entry.
