# Integrate grantmaking web workflows

This package composes application and round views, creation controls, draft providers,
and fictional examples from the owning workflow packages.
Browser interfaces supply concrete transport, navigation, and account context.
Start with [web feature ownership](../../../docs/guides/web-features.md) for a
cross-capability change or the [recommendation walkthrough](../../../docs/guides/recommendation-walkthrough.md)
to follow one connected save.

## Bind a workflow

Use the named entries in the [export map](package.json), such as
`@merit/grantmaking-web/applications` for composed reading views. Intake uses
`@merit/applications-web/intake`, preparation uses `@merit/rounds-web/preparation`,
reviews and participation use `@merit/reviews-web/reviews` and `/reviewer`, and
recommendations use `@merit/recommendations-web/recommendations`. Each workflow
exports its data adapter through `/data` and its messages through `/messages`.
The product's [data composition](../../../interfaces/product/src/features/grantmaking/data/workspace-data.ts)
binds capability adapters to Start functions and supplies query options and cache
scopes. Keep business validation with the owning business capability; controllers receive
operations through browser-safe contracts, and views invoke their actions.

Preserve cache effects when changing a binding. Recommendation saves update the
application cache and invalidate the workspace's round reads. Intake changes and
contact changes use the product's shared grant-work scope. Query infrastructure
owns the [account and fetched-data lifecycle](../../../foundation/query/README.md).
Capability messages are exposed through `/messages` for interface composition.

## Scope drafts and examples

Mount [GrantmakingDrafts](src/views/drafts.tsx) from `/drafts` around editable
grant work. Product composition supplies the account/demo `storageScope`;
changing it resets editing state. The provider combines independent workflow
stores and presents one warning when browser draft recovery is unavailable.
Each workflow retains its own storage schema, original revision baselines, and
reconciliation rules. Derive in-memory draft types from those schemas so stored
and editable shapes stay aligned. Draft schemas accept unfinished values; business
validation still runs when saving.

Omit `storageScope` in previews to keep drafts in memory. Public guides can use
`/examples/recommendation`, which owns fictional page-local state and translation
providers without workspace transport or persistent drafts. The site retains
editorial ownership of those examples.

## Recover after a command

Controllers own their draft, baseline, Undo, and saved outcome. For workflows
that refresh after a command, [useWorkflowRefresh](../../../foundation/query/src/workflow-refresh.ts)
tracks read progress and whether a failure followed a committed save. Supply the
read operation and the `saved` or `read` context; a refresh failure is contained
and must not enter the write's error handling. Retrying repeats only the read.
Recommendation saves instead populate the application cache from their committed
response, as the [walkthrough](../../../docs/guides/recommendation-walkthrough.md#present-the-result-without-losing-the-draft-or-repeating-a-write)
explains.

## Change presentation and controllers

The local guides connect the interaction to its controller and examples:

- [Application intake](../../applications/web/src/views/intake/README.md): section editors, working revisions,
  revision baselines, and reference-pane context.
- [Review work](../../reviews/web/src/views/reviews/README.md): request sessions, received assessments,
  history, and recovery.
- [Reviewer participation](../../reviews/web/src/views/reviewer/README.md): reviewer and manager
  interface states, reference comparisons, and UI verification.
- [Recommendations](../../recommendations/web/src/views/recommendations/README.md): judgment summaries,
  budget help, and reference material during editing.

Keep workflow tests and stories with their owning package. Tests of combined pages
stay here with explicit records and fake operations.
Tests of real Start bindings, route registration, and product query scopes belong
to the interface. Follow [UI verification](../../../docs/guides/ui-verification.md)
for the owning package commands and rendered checks.
