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

## Show workspace activity

`@merit/grantmaking-web/activity` exports `WorkspaceActivity`, a presentational
table of who changed shared grant work. The product route supplies the entries,
the Round and Person options, the filter values, and link renderers, as it does for
the Applications overview. Filters are page state: keep them in component state and
send them in a request body so a person's identifier never reaches a URL. See the
[workflow](../../../docs/workflows/review-and-decide.md#catch-up-on-shared-changes)
for what Activity lists and the [stories](src/views/activity/workspace-activity.stories.tsx)
for each state.

## Search the workspace

`@merit/grantmaking-web/search` exports `WorkspaceSearchDialog`, which finds records,
opens workspace pages, and starts creation. The interface supplies the open state,
`data` from `@merit/grantmaking-web/data/search` bound to an abortable transport,
`links` for record addresses and router links, and authorized `commands` for pages
and actions. Each command supplies its visible title and natural search names.
An empty opening shows those choices without fetching records or storing history.
The product supplies the existing creation controller through `CreateAction`'s
`renderTrigger`: choosing it opens the same draft and form as the page's creation button.

The [controller](src/controllers/search/use-workspace-search.ts) waits about 150 ms for
typing to pause and settles one query; the [data adapter](src/data/search/workspace-data.ts)
cancels replaced requests and discards query data once search closes. Typed text stays
in component state and travels only in the request body. Local choices match every
word, ignoring case and accents. One mixed list orders exact, prefix, then other matches;
records precede local choices on ties. The business API owns record ordering.
Per-type record totals remain separate from the local choice count.

Earlier records remain visible but disabled while a new query loads; local choices
remain usable. Settled results highlight the top choice, Up and Down move through the
list, and Enter opens the highlighted choice. Real links preserve modifier and middle
clicks. Opening a choice in this tab or pressing Escape closes search. Failure keeps
the typed text and local choices, with **Try again** for the remote records. The footer
summarizes keyboard controls. On narrow screens search fills the screen and the
navigation drawer closes first. Location changes close search, and reopening starts empty.

The [workflow](../../../docs/workflows/review-and-decide.md#search-the-workspace) owns
access, matching, order, and limits, and the [stories](src/views/search/workspace-search.stories.tsx)
show each state.

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
