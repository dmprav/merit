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
review work uses `@merit/reviews-web/work`, participation uses `/reviewer`, and
recommendations use `@merit/recommendations-web/recommendations`, and committee
decisions use `@merit/decisions-web/work`. Each workflow
exports its data adapter through `/data` and its messages through `/messages`.
The product's [data composition](../../../interfaces/product/src/features/grantmaking/data/workspace-data.ts)
binds capability adapters to Start functions and supplies query options and cache
scopes. Keep business validation with the owning business capability; controllers receive
operations through browser-safe contracts, and views invoke their actions.

Preserve cache effects when changing a binding. Recommendation saves update the
application cache and invalidate the workspace's round reads. Intake changes and
contact changes use the product's shared grant-work scope. A decision save does the same
for the application and also updates the round's committed totals; it never changes the
recommendation or its proposed totals. Query infrastructure
owns the [account and fetched-data lifecycle](../../../foundation/query/README.md).

## Compare applications

Workspace and round application views use compact, sortable tables with the
shared collection toolbar. Open **Filter** for application and applicant search,
round selection and the independent participation, readiness, review, evidence,
and recommendation criteria. All criteria are visible, with **Any** until a value
is selected. Selected criteria combine with AND and remain visible as removable chips;
**Clear filters** is inside the popover. List state is preserved on return from
an application. Participation alone controls whether withdrawn applications are
included; other criteria can match withdrawn records. Changed evidence or criteria
includes outdated reviews, changed assessment criteria, and recommendations from
an earlier application version.

Review progress uses the review-owned
[collection summary](../../reviews/web/src/views/reviews/README.md#compare-review-work-in-collections).
Recommendations from an earlier
application version carry their own status hint. The round's properties panel
contains its whole-round financial summary and review progress only in the
Applications tab, with qualifications following the affected financial values.
Summary rows reserve space for a trailing status hint so values remain aligned
even when no hint is needed. On
narrow screens the properties and summary follow the collection. Filtering never
changes those whole-round totals.
Both application tables use the same bounded query and collection controls, reading
at most 50 summaries after applying round, search, independent criteria and global
sorting. Money sorting retains exact amounts and places unknown amounts last.
Previous/Next navigation shows the range and exact matching count. Round metadata,
financial and review totals, and counts of reviews affected by criteria changes
are separate aggregates; the round page does not load application detail records.

`@merit/grantmaking-web/data/applications` owns query normalization, debouncing,
page recovery and session restoration. Interfaces supply transport and the private
cache scope. Supply a stable `viewId` within the workspace to identify session
preferences independently of the selected round filter. Query text and criteria
stay in account-session state and POST bodies. Sorting also uses session state
unless the caller supplies a controlled `sorting` value and change action together.
The workspace interface binds that pair to its address; round lists retain their
own session sorting. Changing a filter, query or order starts at the first page.
A failed page read keeps the previous page and offers a read-only retry beside the
page controls. Production views require controlled list data. Static stories and
tests use the explicit local list adapters from `/testing`.

Round preparation accepts its own `PreparationRound` contract: round properties,
the application count, and counts of reviews affected by criteria changes. Grantmaking
supplies those facts alongside its separate financial and review summaries, so
preparation does not depend on the application-list projection.

## Show workspace activity

`@merit/grantmaking-web/activity` exports `WorkspaceActivity`, a presentational
chronological list of who changed shared grant work. The product route supplies the entries,
the Round and Person options, the filter values, and link renderers, as it does for
the Applications overview. Filters are page state: keep them in component state and
send them in a request body so a person's identifier never reaches a URL. See the
[workflow](../../../docs/workflows/review-and-decide.md#catch-up-on-shared-changes)
for what Activity lists and the [stories](src/views/activity/workspace-activity.stories.tsx)
for each state.

The shared collection toolbar contains Round and Person filters, removable
selections, reset, and loading status. Timestamps show plain local date and time
in the viewer’s browser timezone. The view requests
the next cursor page near the list end, retains a keyboard-accessible manual
loading control, and stops automatic requests after a failure until the caller
retries. Recovery uses the same `CollectionRecovery` from `@merit/ui/paged-content`
as paged applications and related-record lists. Place it at the list end where an
older-page request starts, retaining its retry control during the request.

Activity rows keep the event, target, actor and local time visible. The event action
opens the shared side panel with full record and actor details, the recorded time,
source provenance and any recorded reason. Closing restores the action's focus
and the list position. Native record links remain separate from the panel trigger
and retain normal navigation and open-in-new-tab behavior.

Chronological browsing loads continuously; application worklists use bounded pages
for comparison and returning to work. Activity retains ordinary loaded rows so
opening and closing a side panel preserves their measured height and reading position
across browsers. Loaded data and DOM remain retained; this is not virtualization.

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
word, ignoring case and accents.

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
and must not enter the write's error handling. Views present the failure as a toast with **Refresh**.
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
- [Recommendations](../../recommendations/web/src/views/recommendations/README.md): judgment summaries
  and reference material during editing.

Keep workflow tests and stories with their owning package. Tests of combined pages
stay here with explicit records and fake operations.
Tests of real Start bindings, route registration, and product query scopes belong
to the interface. Follow [UI verification](../../../docs/guides/ui-verification.md)
for the owning package commands and rendered checks.
