# Checking architecture changes

Run `vp run architecture` after moving code or changing dependencies. It checks
package and runtime boundaries with JS Boundaries, library and I/O ownership
with native lint rules, dependency cycles within and across capabilities, capability TypeScript
program isolation, and the [cross-cutting mechanisms map](#inspect-cross-cutting-mechanisms).
The pre-commit hook and `vp run ready` run the same command.

Package `exports` define the public API. Importing another capability's server
code also requires an approved consumer and entry. A new server export does not
grant access automatically. Private moves within a package need no policy change
when they preserve the source role. Packages under `capabilities/*/business`
share a common role policy, so moving production code between roles changes
which dependencies it may use. API definitions share one role;
tests may compose their capability’s layers wherever they are placed.

## What the checks protect

| Guarantee                         | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency direction              | Foundation stays independent of capabilities and application code; capabilities stay independent of interfaces and assembly; business never imports web code; interfaces never import assembly. These rules also apply to tests and types.                                                                                                                                                                                                                       |
| Public package APIs               | Cross-package production imports use `@merit/` exports. Private subpaths, relative paths, and aliases cannot bypass those exports. Tests use public APIs across packages, with access to repository test harnesses.                                                                                                                                                                                                                                              |
| Pure business rules and contracts | Domain and contract files cannot import server implementation or browser UI, including through types or re-export barrels.                                                                                                                                                                                                                                                                                                                                       |
| Cross-capability server imports   | Server entries require an approved consumer role or assembly location, public specifier, and resolved provider role. Unapproved consumer roles, public entries, and upstream/sibling dependencies are denied by default.                                                                                                                                                                                                                                         |
| Structured business roles         | Domain, API, handlers, persistence, assembly, and examples follow explicit dependency directions. Public and private barrels cannot bypass them.                                                                                                                                                                                                                                                                                                                 |
| Browser/server separation         | Browser source cannot import server implementation. Interface server functions and server modules can adapt business operations. Request contexts use browser-safe API types; server types have no exception.                                                                                                                                                                                                                                                    |
| Production independence           | Runtime code cannot depend on tests, stories, mocks, scripts, or build configuration.                                                                                                                                                                                                                                                                                                                                                                            |
| Email presentation                | Email code can consume pure business contracts, but stays independent of business operations and browser UI.                                                                                                                                                                                                                                                                                                                                                     |
| Explicit I/O ownership            | Views and controllers cannot access `fetch`, `localStorage`, or `sessionStorage`, including through `window` or `globalThis`. Data adapters and tests can.                                                                                                                                                                                                                                                                                                       |
| Web workflow ownership            | Views and controllers cannot import concrete data adapters or interface transport, including through types and re-exports. Views cannot import TanStack Query; controllers cannot import views; data adapters cannot import either.                                                                                                                                                                                                                              |
| Deterministic workflow code       | Files named `*.workflow.ts` can import only `@temporalio/workflow`, other workflow modules, local type-only imports (an `import type` from `@temporalio/client` is still rejected), and pure code. Node.js APIs, npm packages, the database, and capability server entries are rejected. `@temporalio/client`, `worker`, and `proto` belong to `foundation/workflows`, and `@temporalio/testing` is rejected everywhere because it downloads an unpinned server. |
| Acyclic dependencies              | Fallow detects file and package cycles. The capability check groups production imports by capability, including type-only imports and re-exports.                                                                                                                                                                                                                                                                                                                |

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
| Integration entry            | Domain and private persistence functions.                                   |
| Reading entry                | Domain, query handlers, query persistence, and shared persistence.          |
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

Pure business code (`domain/`, `api/`, and `examples/`) may import `pure` entries
from `@merit/` foundation and business packages (excluding cross-capability
`examples/`) as well as Zod, while `package.json` declarations, Fallow cycle
checks, and capability direction rules govern which packages may depend on one
another. Pure business code cannot use arbitrary external libraries, Node
builtins, database code, or browser UI. New capabilities inherit these rules
automatically without capability registration.

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
check downstream usage or apply downstream lifecycle effects under the caller’s
held locks and transaction, without introducing reverse package dependencies.

Organizations has narrow server support modules for injected dependencies, operator
authorization, result handling, and token hashing. Commands, queries, and assembly
may use them; support modules can use only domain, API definitions, and each other.
They cannot introduce handler or persistence dependencies.

`server/integrations.ts`, `server/read.ts`, and `server/demo.ts` provide deliberate
server-only integration entries. Their callers must preserve the documented authorization,
lock, and transaction obligations. Ordinary command and query handlers cannot
depend on these privileged entries or the server assembly.

Only Grantmaking’s own capability packages may import `@merit/grantmaking` or
its subpaths in production capability code. Grantmaking combines the owners’ contracts for its web and AI
packages, the interfaces, and application assembly. The
[capability dependency check](../../tooling/verification/architecture/capabilities.ts)
also detects cycles across owners by grouping their business, web, and AI
packages. Test and Storybook fixtures may compose the combined views.

## Connect capabilities through declared integrations

`serverImports` declares permitted server imports between capabilities and from
application assembly by consumer role, public entry pattern, and resolved provider
role (`business-assembly`, `business-demo`, `business-shared-persistence`,
`business-command-persistence`, `business-query-persistence`, `business-grant-work`,
`business-integrations`, and `business-reading`). All three must match, a leaf rule keeps `audit` isolated
from all foreign business packages (current and newly added), and
`upstreamDisallowedTargets` keeps upstream and sibling capabilities independent of
downstream capabilities outside composition tests (`tests/` and `testing/`). The
policy also covers types, re-exports, and dynamic imports with known sources, and
applies to unclassified server entries and newly added capabilities as well as the
structured packages. Browser-safe dependencies retain their existing rules.

Current integrations have distinct responsibilities:

| Consumer                              | Permitted integration                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Applications and Reviews commands     | Contact lookup through `@merit/contacts/scope`.                                                                     |
| Capability commands                   | Organization locks through `@merit/organizations/locks` (and downstream grant-work locks).                          |
| Approved persistence roles            | Shared schemas and scopes through `./schema` and `./scope`; shared policy bindings may use `@merit/access/scope`.   |
| Applications and Reviews integrations | The type-only `@merit/contacts/server/grant-work` interface, each implementing the part about its own records.      |
| Grantmaking demo seeding              | Grant-work and contact demo seeding through `@merit/*/server/demo`, excluding `organizations/server/demo`.          |
| Audit recording and history           | Write-owning commands record through `@merit/audit/server/record`; queries read through `@merit/audit/server/read`. |

Organizations, Applications, Rounds, Reviews, Recommendations, and Decisions record
audit events in the same transaction as the command. Grantmaking, Organizations, and
Reviews authorize history reads through their queries. The
[audit guide](../../capabilities/audit/business/README.md) explains the recording contract.

Applications can read Rounds. Reviews, Recommendations, and Decisions can each
read Applications and Rounds. Those three capabilities remain independent of one
another, and Applications and Rounds cannot import their implementations.
Grantmaking composes reads across all five owners through their public exports.

Reviews, Recommendations, and Decisions each implement their part of the type-only
`@merit/applications/server/grant-work` contract. Applications uses Decisions to
block deletion once an application has a decision and to block withdrawal while its
current decision commits funding. Decisions also implements the commitment check in
`@merit/rounds/server/grant-work` so Rounds can reject a budget below the committed
total. Applications and Reviews each implement their part of the Contacts contract.
Application assembly wires these collaborators through each owner's
`@merit/*/server/integrations` entry. Grantmaking supplies no integrations: it cannot
relay downstream lifecycle work, and assembly cannot import an integrations entry
from it. The architecture fixtures check these allowed and rejected directions.

Grant lock contexts carry the transaction and the IDs of locked rows. Applications
takes the round context before locking a case. Reviews takes the case context
before locking an assignment. Round and application lifecycle contracts import
their own lock types, so callers pass the locked resource to each collaborator.

Organization `scope` exports contain read predicates. The `locks` entry lives in
command persistence, so neither queries nor the shared scope module can import
or re-export it. Public entry names alone cannot bypass this distinction: a scope
export redirected to command persistence also fails the check.

Application permissions are limited to the service composition in
`app/src/server/services.server.ts`, demo composition in `app/src/server/demo.server.ts`
and `app/src/server/demo-workspace.server.ts`, and demo cleanup in `app/scripts/clean-demos.ts`.
Each location has its own permitted entries.
Interface adapters use the services supplied by assembly and browser-safe API
types; they cannot instantiate capability services through direct server imports.

For a new collaboration, let the receiving capability define the information or
behavior it needs. Supply the implementation from application assembly, as with
the contacts grant-work interface. New capabilities inherit standard assembly,
demo, persistence, lock, and audit policies automatically when they follow the
common `businessRoles` layout and `package.json` `exports`. Declare a direct
entry rule in `serverImports` only for non-standard server entries or specialized
consumer obligations, then add positive and negative architecture fixtures for it.
Keep permissions narrow when adding an entry or moving an assembly location.

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

## Inspect cross-cutting mechanisms

Shared concerns that cut across capabilities and surfaces (authorization, audit
trails, locks and transactions, drafts and recovery, exact money, delegated MCP,
demo lifecycles, telemetry and analytics, and shared UI patterns) live in the
[cross-cutting mechanisms registry](../../tooling/verification/architecture/mechanisms.config.ts).
Each entry maps a mechanism's contract and adapter patterns to its owning
documentation, active decision records, and up to three single-line review
`invariants` (capped at 140 characters each).

- Run `vpx tooling/verification/architecture/mechanisms.ts --paths <paths...>`
  before planning or editing to list the guides, decisions, and invariants that
  govern candidate files.
- Run `vpx tooling/verification/architecture/mechanisms.ts --base <ref>` (with
  `--head <ref>` to compare a ref other than `HEAD`) on a branch to classify
  touched mechanisms as `extends` (changes to a mechanism's contract) or
  `composes` (changes to an adapter, view, schema, or controller) and print
  their `invariants`.
- `vp run architecture` runs `--check` to verify pattern matches, documentation
  paths, heading anchors, summary and invariant limits, and active decision
  statuses.

## Change a guarantee deliberately

Run `vp run test:architecture` after changing the package policy, resolver, or
mechanisms checker, and
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
