# Checking architecture changes

Run `vp run architecture` after moving code or changing dependencies. It checks
package and runtime boundaries with JS Boundaries, library and I/O ownership
with native lint rules, dependency cycles with Fallow, and capability TypeScript
program isolation. The pre-commit hook and `vp run ready` run the same command.

Package `exports` define the public API. Importing another capability's server
code also requires an approved consumer and entry. A new server export does not
grant access automatically. Private moves within a package need no policy change
when they preserve the source role. Packages under `capabilities/*/business`
share a common role policy, so moving production code between roles changes
which dependencies it may use. API definitions share one role;
tests may compose their capability’s layers wherever they are placed.

## What the checks protect

| Guarantee                         | Effect                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency direction              | Foundation stays independent of capabilities and application code; capabilities stay independent of interfaces and assembly; business never imports web code; interfaces never import assembly. These rules also apply to tests and types. |
| Public package APIs               | Cross-package production imports use `@merit/` exports. Private subpaths, relative paths, and aliases cannot bypass those exports. Tests use public APIs across packages, with access to repository test harnesses.                        |
| Pure business rules and contracts | Domain and contract files cannot import server implementation or browser UI, including through types or re-export barrels.                                                                                                                 |
| Cross-capability server imports   | Server entries require an approved consumer role or assembly location, public specifier, and resolved provider role. New capabilities and unapproved exports are denied by default.                                                        |
| Structured business roles         | Domain, API, handlers, persistence, assembly, and examples follow explicit dependency directions. Public and private barrels cannot bypass them.                                                                                           |
| Browser/server separation         | Browser source cannot import server implementation. Interface server functions and server modules can adapt business operations. Request contexts use browser-safe API types; server types have no exception.                              |
| Production independence           | Runtime code cannot depend on tests, stories, mocks, scripts, or build configuration.                                                                                                                                                      |
| Email presentation                | Email code can consume pure business contracts, but stays independent of business operations and browser UI.                                                                                                                               |
| Explicit I/O ownership            | Views and controllers cannot access `fetch`, `localStorage`, or `sessionStorage`, including through `window` or `globalThis`. Data adapters and tests can.                                                                                 |
| Web workflow ownership            | Views and controllers cannot import concrete data adapters or interface transport, including through types and re-exports. Views cannot import TanStack Query; controllers cannot import views; data adapters cannot import either.        |
| Acyclic dependencies              | Fallow detects file and package cycles, including package cycles containing type-only edges.                                                                                                                                               |

The [configuration](../../tooling/verification/architecture/config.ts) classifies packages by
location and files by runtime role. Business source is server-side by default;
`domain/`, `contracts/`, `api/`, and `examples/` identify pure code. The common
roles apply to new business packages automatically; `server/` remains server-only.
Interface `.functions.ts` files are server-function adapters whose exported functions can
be called from browser code; `.server.ts` files remain server-only. Unclassified
source files fail the check instead of silently escaping it.

The [resolver](../../tooling/verification/architecture/resolver.mjs) reads the importing file's
TypeScript configuration, including inherited aliases. For `@merit/` imports it
also resolves the package without aliases and requires the same exported file.
Local aliases can remain local; they cannot replace a package's public API.

## Extend business code without crossing roles

Choose the source role for the responsibility being added. `businessRoles` defines
one set of patterns and allowed dependencies for every business package. The
rules compare roles within the same package; capability-specific declarations
cover only exceptional support files and approved external collaborations.
These rules apply to values, types, re-exports, and dynamic imports with a
statically known source.

| Source role                  | Permitted dependencies within the same capability                           |
| ---------------------------- | --------------------------------------------------------------------------- |
| Domain                       | Domain only.                                                                |
| API                          | Domain and API definitions, including the public service interface.         |
| Command handlers             | Domain, API, command handlers, command persistence, and shared persistence. |
| Query handlers               | Domain, API, query handlers, query persistence, and shared persistence.     |
| Command or query persistence | Domain, the same persistence group, and shared persistence.                 |
| Shared persistence           | Domain and shared persistence.                                              |
| Server assembly              | API definitions and command/query handlers.                                 |
| Contact integration          | Domain and private persistence functions.                                   |
| Demo lifecycle               | Example records, domain, command persistence, and shared persistence.       |
| Examples                     | Domain, API definitions, and examples.                                      |

Command persistence includes the reads needed to decide and commit a change.
Query persistence owns consumer reads. Shared schema, encoding, locks, and SQL
projections cannot depend on either persistence group, so placing a helper there
cannot conceal a dependency from a command onto a query or vice versa.

API files may share types and definitions across commands, queries, and service
assembly. Keep their public meaning clear through review and contract tests;
the checker treats `api/` as one browser-safe role. Request contexts use that
interface without importing server types.

`pureImports` records each capability's approved browser-safe workspace entries.
Pure business code may also use Zod, but not arbitrary external libraries, Node
builtins, database code, or browser UI. A new capability inherits those safety
rules and needs a declaration only when it consumes another package's pure entry.

Tests and fixtures may compose local layers regardless of their directory.
Colocation helps readers find focused behavior checks; it does not restrict which
local implementation a test can exercise. Cross-package public exports and
dependency direction still apply, and production code cannot import tests.
Keep scenarios focused on observable behavior and follow the
[test guidance](testing.md) when choosing fixtures and coverage.

Contacts, Rounds, and Applications have server-only `grant-work.ts` contracts supplied
by application assembly. Handlers and service assembly can use these contracts;
command persistence can pass its transaction to a collaborator. Contracts may depend
on their own domain types, but cannot import persistence or handlers. Their callbacks
check downstream usage under the caller’s held locks,
without introducing reverse package dependencies.

Organizations has narrow server support modules for injected dependencies, operator
authorization, result handling, and token hashing. Commands, queries, and assembly
may use them; support modules can use only domain, API definitions, and each other.
They cannot introduce handler or persistence dependencies.

`server/integrations.ts` and `server/demo.ts` provide deliberate server-only
integration entries. Their callers must preserve the documented authorization,
lock, and transaction obligations. Ordinary command and query handlers cannot
depend on these privileged entries or the server assembly.

## Connect capabilities through declared integrations

`serverImports` declares permitted server imports between capabilities and from
application assembly. Each permission identifies the consumer, public import
specifier, and resolved provider role or file. All three must match. The policy also covers types,
re-exports, and dynamic imports with known sources. It applies to unclassified
server entries and newly added capabilities as well as the structured packages.
Browser-safe dependencies retain their existing rules.

Current integrations have distinct responsibilities:

| Consumer                            | Permitted integration                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Applications and Reviews commands   | Contact lookup through `@merit/contacts/scope`.                                                                          |
| Grant-work and Contacts commands    | Organization locks through `@merit/organizations/locks`.                                                                 |
| Approved persistence roles          | Contact and organization schemas and organization read predicates; shared policy bindings may use `@merit/access/scope`. |
| Grantmaking's contact-usage adapter | The type-only `@merit/contacts/server/grant-work` interface, implemented for injection by application assembly.          |
| Grantmaking demo seeding            | Contact demo seeding through `@merit/contacts/server/demo`.                                                              |

The four grant-work owners have explicit downstream dependencies. Applications can
read Rounds; Reviews and Recommendations can read Applications and Rounds. Neither
Applications nor Rounds can import review or recommendation implementation. Reviews
and Recommendations remain independent of each other. Grantmaking composition reads
all four through owned schema, scope, and encoding exports. Its usage adapter
implements Applications' type-only lifecycle contract. The architecture fixtures
check these allowed and rejected directions.

Organization `scope` exports contain read predicates. The `locks` entry lives in
command persistence, so neither queries nor the shared scope module can import
or re-export it. Public entry names alone cannot bypass this distinction: a scope
export redirected to command persistence also fails the check.

Application permissions are limited to the service composition in
`app/src/server/services.server.ts`, demo composition in `app/src/server/demo.server.ts`, and demo cleanup
in `app/scripts/clean-demos.ts`. Each location has its own permitted entries.
Service composition supplies audit's recorder through each recording capability's
own contract, such as Recommendations' `RecordRecommendationAudit`. Commands cannot
import audit's implementation; they pass their existing transaction to the injected
recorder. Grantmaking's query layer alone reads activity through `@merit/audit/server/read`,
since audit imports no capability and relies on its caller to resolve record titles
and round membership.
Interface adapters use the services supplied by assembly and browser-safe API
types; they cannot instantiate capability services through direct server imports.

For a new collaboration, let the receiving capability define the information or
behavior it needs. Supply the implementation from application assembly, as with
the contacts grant-work interface. Declare a direct server import only when its
consumer role and caller obligations are intentional, then add positive and
negative architecture fixtures for it. Keep permissions narrow when adding an
entry or moving an assembly location.

Integration scenarios and seed helpers under `tests/` and `testing/` may compose
server entries. Colocated tests retain their source role’s cross-capability server
permissions while freely composing local layers and public browser-safe entries.
Production code cannot import those test helpers.

## What remains a design decision

Use the [architecture](../foundations/architecture.md) and
[web feature guide](web-features.md) to choose ownership and internal structure.
The checker enforces declared server integrations, pure dependency allowlists,
and the dependency directions of `views/`, `controllers/`, and `data/` in web
capabilities and browser interfaces. Named feature entries outside those directories
compose the roles through browser-safe contracts. Tests and stories may compose
them for verification. The rules cover resolved files, so a view cannot bypass a
data directory's ownership by importing its barrel or a type from it.

Feature privacy within one interface package, the meaning of an operation's
interface, and abstraction level inside functions remain review decisions. Moving
implementation into an unclassified feature entry does not establish appropriate
ownership. Use the [coding conventions](coding-conventions.md#keep-functions-at-a-coherent-level-of-abstraction)
to review what callers must understand and where future changes belong.
External-library ownership lives beside the graph policy in
[architecture import rules](../../tooling/verification/architecture/imports.ts).
Ordinary correctness, accessibility, and code style remain in the
[lint configuration](../../tooling/verification/lint.ts).

Static checks cover resolvable imports. Review computed module names and framework
transformations, and test their behavior at the affected runtime boundary.
Import rules do not prove that SQL only reads or that writes stay with the table's
owner. An approved Drizzle schema import can still be used in an update. Read-only
transactions protect query execution; stronger command write ownership would need
a separate database-permission or data-access design. Verify authorization,
transaction atomicity, retry handling, and lock ordering with database restrictions
and integration tests.

## Change a guarantee deliberately

Run `vp run test:architecture` after changing the package policy or resolver, and
`vp run test:fallow` after changing Fallow configuration. The architecture tests
exercise the actual lint command against temporary workspace packages, including
deliberate private imports, aliases, runtime violations, library ownership, and
valid internal moves. `vp run architecture` also runs the
[TypeScript isolation checks](../../tooling/verification/architecture/typescript.test.ts),
which inspect the actual web capability programs and verify detection of forbidden
source inclusions and project references using disposable configurations.

Run `vp run code-health` for unused code and dependency declarations. Add implicit
framework entry points to [Fallow's configuration](../../.fallowrc.jsonc) when the
framework genuinely loads them; remove ordinary unused code.

Follow the [coverage policy](testing.md#coverage-policy-changes) before
weakening a required guarantee or removing its tests.
