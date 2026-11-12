# Changing web features

Start with the capability, then choose the layer that owns the change. Views
present work, controllers coordinate it, and data adapters connect it to saved
records. Business rules remain in `capabilities/<name>/business`; interactive
features live in `capabilities/<name>/web`. Product routes, typed navigation,
Start handlers, and transport binding remain in `interfaces/product`. The
[architecture](../foundations/architecture.md#application-structure) explains the
package boundaries.

For a concrete path through these layers, follow the
[recommendation save walkthrough](recommendation-walkthrough.md). It connects the
browser editor and MCP adapter to one business operation and its tests.

## Choose the owning layer

The first three rows belong to the capability's web package. Concrete Start
functions and route adapters belong to the browser interface. Keep reusable feature
contracts independent of both the router's registration and Start function types.

| Change                                                                  | Location                       |
| ----------------------------------------------------------------------- | ------------------------------ |
| Content, form controls, layout, focus, or scrolling                     | `views/`                       |
| Drafts, revision baselines, save commands, conflicts, Undo, or recovery | `controllers/`                 |
| Queries, record decoding, server calls, or cache synchronization        | `data/`                        |
| Server validation, identity resolution, or business-operation responses | Interface `data/server/`       |
| An operation interface shared by a controller and adapter               | `contracts.ts` or `contracts/` |
| Connecting a capability's records and operations to its presentation    | Named public entry             |

Group substantial workflows inside the layers: for example,
`applications/web/src/views/intake/` and `applications/web/src/controllers/intake/`.
Keep tests, stories, styles, fixtures, and mocks beside the implementation they
exercise. Create directories for actual responsibilities rather than empty templates.

Interface-specific workflows follow the same ownership rules within their interface.
For example, [organization administration](../../interfaces/admin/src/features/organizations/screens.tsx)
binds its data adapter to creation and editing controllers, then supplies views.
Its operator-specific work stays in admin; reusable workspace interactions belong
to capability web packages.

Views may call controller hooks. A small editable wrapper can initialize its
workflow and render the result, while read-only content renders without a controller
or draft provider. Controllers receive save and refresh operations through their
interface; they do not import concrete data adapters, server functions, or views.
Views cannot fetch records or change query caches. Data adapters own those details.
Controllers receive navigation actions such as `onDeleted()`; interfaces bind
them to the typed router. Supply typed link renderers when a reusable view needs
an application destination.

Expose workflow actions such as changing a meeting date or assigning a manager.
Controllers construct their commands and select revision baselines; views supply
the edited values. Opening an editor and undoing a save are workflow actions too:
keep baseline capture and revision selection behind those actions. For example,
a contact picker supplies a selected person while its controller retains the
revision against which the choice was made. Give controls only the state and
actions they need. Keep command decisions pure where they can be verified without
rendering. Business predicates and validation limits belong in the owning business
package so forms and server operations apply the same rules.

Keep contracts small and browser-safe. Reuse business read models and result types;
carry typed business errors through adapters and controllers so presentation mappings
stay complete when an operation changes. Views translate outcomes and success events;
only the form submission boundary turns a failure into its localized message.
Do not derive workflow interfaces from server-function implementations. Private
component props, draft types, and reconciliation helpers stay with their owner.

## Bind data and reuse a feature

The capability data layer owns normalization, query/cache behavior, cancellation,
cache updates, and invalidation through an explicit transport contract. The product
interface binds that contract to Start functions and supplies its actual query
options and cache scopes. Preserve those effects when moving an adapter; keep
cross-capability cache coordination with the interface that composes the work.
The [query contract](../../foundation/query/README.md) owns fetched-data and
account lifetimes.

Consume named package exports and supply one cohesive transport or operation
interface. Use [`@merit/drafts`](../../foundation/drafts/README.md) for browser recovery,
keeping draft storage and reset behavior behind the capability's provider;
previews need explicit local state. Feature messages stay capability-owned and
are aggregated by each interface. The
[grantmaking integration guide](../../capabilities/grantmaking/web/README.md)
explains its exports, draft scope, cache effects, and public examples. The connected
[contact provider](../../capabilities/contacts/web/src/provider.tsx) similarly accepts
transport from its consumer; business eligibility remains a caller-owned predicate.

Public guides own their editorial composition and can embed capability-owned
examples. Follow [public-guide authoring](../../interfaces/site/src/features/docs/README.md)
for fictional data, local state, and verification.

## Preserve the result of an action

A save has two distinct outcomes: whether the write committed, and whether the
latest information could be loaded afterward. Carry those outcomes separately as
typed state so views can choose the message and recovery action. Retain the known
write result and any committed Undo when a refresh fails. Clear a committed draft
once; retrying a refresh must not repeat the write. Keep original baselines until
a person explicitly reconciles a stale draft. Each workflow owns this behavior;
a shared form primitive does not decide it.

Navigation and focus also have explicit owners. Application navigation switches
reference material; editors restore focus when editing ends. Preserve reading
position and unfinished work when moving between those contexts. Local feature
guides explain how their controllers and views implement these responsibilities.

## Find an existing workflow

For screen composition and example states, start with the local guides for
[application intake](../../capabilities/applications/web/src/views/intake/README.md),
[review work](../../capabilities/reviews/web/src/views/reviews/README.md), and
[recommendations](../../capabilities/recommendations/web/src/views/recommendations/README.md).
Their linked contributor workflows own the business guarantees.

Other useful entry points are:

| Work                             | Start here                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round preparation and Undo       | [Preparation controller](../../capabilities/rounds/web/src/controllers/preparation/use-round-preparation.ts)                                                                                         |
| Team access and invitations      | [Team controller](../../capabilities/organizations/web/src/controllers/team.ts)                                                                                                                      |
| Contact drafts and save recovery | [Contact editor controller](../../capabilities/contacts/web/src/controllers/contact-editor.ts) and [directory controller](../../capabilities/contacts/web/src/controllers/directory.ts)              |
| Operator organization management | [Admin editing controller](../../interfaces/admin/src/features/organizations/controllers/organization.ts) and [data adapter](../../interfaces/admin/src/features/organizations/data/organization.ts) |

## Complete the change

Move a cohesive responsibility with its verification. Reuse shared forms, query
infrastructure, and UI while retaining each workflow's draft and recovery rules.
Cross-capability integration goes through a deliberate public entry, such as the
connected contact picker. Selection requirements and business eligibility remain
separate: a required picker requires a selection, while its caller supplies
eligibility rules from the owning business package.

The [contact picker](../../capabilities/contacts/web/src/views/contact-picker.tsx)
applies the same selection restrictions to listed contacts and newly saved contacts.
Saving an ineligible contact preserves the contact without changing the selection;
the picker explains how to continue. The
[directory](../../capabilities/contacts/web/src/views/contacts-directory.tsx) owns
searching, editing, and archiving contacts. Both use the shared contact editor.

Preserve server transport behavior, package exports, draft storage keys and recovery
formats, account/workspace reset behavior, and per-section baselines during a
structural refactor. Update callers and examples with the moved implementation,
then remove superseded paths and temporary exceptions. Review guidance that names
the moved owner or its test command, including the
[UI verification table](ui-verification.md#verification).

Keep pure component/controller tests and stories with the capability; use its own
message providers and explicit fake transport where needed. Tests that exercise
real Start bindings, query scopes, or route registration stay with the interface.
Capability packages must typecheck independently, including tests and stories,
without source inclusion from `app/` or `interfaces/`.

Exercise the workflow through its supported entry. Verify draft recovery, stale
revisions, failed writes, failed refreshes, read-only rendering, and keyboard
interactions where affected. Follow the [verification guide](verification.md#verification)
for types, architecture checks, feature tests, and browser checks. Architecture
fixtures must reject forbidden imports, including type-only and re-export paths.
