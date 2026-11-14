# Fetching and updating application data

Use `@merit/query` to create the client shared by a browser router or one SSR
request. Features import TanStack Query directly for query options and hooks.
The application owns Router integration and hydration; never create a process-wide client.
Route loading and error components load eagerly so recovery itself needs no network
request. Ordinary page components remain split by route.

Capability data modules own reusable query/cache behavior through explicit transport.
Browser-interface adapters bind that transport to Start functions and supply query
options and cross-capability scopes where their composition owns them. Load required data
with `context.queryClient.fetchQuery(options)` in the route loader, and subscribe
with the same options in the screen. Cache serialized contract values; decode
money and other domain values for presentation. Pass the query's abort signal to
the server function so cancellation prevents obsolete responses from winning.

## Freshness and account lifetime

Private keys start with `privateKey`, followed by the capability, workspace, and
resource identity. Their account scope is the lifetime of the browser client:
the application-owned account adapter cancels and clears it on identity changes,
then reloads the document to discard route data and drafts too. Local fixture
switching also reloads the document. Do not persist private caches in browser storage.

Reads are stale immediately, so route loaders check current access on navigation.
Mounting their observers does not repeat the read, and focus alone does not refresh
an editor. Reads attempt immediately even while offline, so a failed initial load
reaches its recovery view instead of waiting for connectivity. Reconnection can
refresh active reads. Inactive data remains in memory
for up to five minutes; retaining it is not permission to bypass a fresh route read.
The persisted demo uses the same authorized queries and mutations as other
workspaces. Fictional public examples have explicit page-local state and do not
reuse a private account cache.

## Mutation and failure handling

Use `useMutation` for persisted changes and inspect the returned domain status.
A resolved `conflict` or `forbidden` result is not a successful business operation.
Retries are disabled; writes run immediately even when offline so failures remain
visible instead of being queued for later replay.

After a confirmed write, cancel competing reads before applying the response to
its cache entry. Invalidate affected details, summaries, and access information.
Use Router invalidation only for route-owned context or navigation decisions;
Query invalidation owns fetched data. Preserve a successful-save notice if a
subsequent refresh fails, and offer a read-only retry when the missing information
affects subsequent work. Retry a failed route load through Router invalidation;
keep the document and its draft providers mounted. Recovery actions show their own
pending state and never repeat a committed write.

`available` turns an `unavailable` service result into a query error, preserving
previous data during a failed refresh. Access-denial results remain data and must
replace the previous authorized view. Workspace discovery retains its typed
failure result because the surrounding workspace can still render while the
switcher is unavailable. Its loader tolerates transport failures too; each resource
loader independently checks access. Temporary discovery failures preserve the
current workspace's established draft scope and mounted editors. Confirmed account
or scope changes still reset editing state.

A failed background read can retain usable content without a notice. The owning
workflow presents a failure when it blocks work or makes the next decision uncertain;
query infrastructure does not announce every failed request. See the
[feedback guidance](../ui/src/patterns/feedback/feedback.mdx#recover-the-affected-work) for presentation.

Forms own editable values, validation, and duplicate-submit guards. Recommendation
drafts retain their original version baselines through cache refreshes and conflicts.
Query does not own those drafts or permission rules.

See [architecture](../../docs/foundations/architecture.md) and the
[development checks](../../docs/guides/verification.md#verification).

## Bounded collections

`PageSource` from `@merit/query/contracts` carries the private query key and a
cursor-based read. Capability data adapters bind it to their authorized transport.
Return `null` for missing or denied resources, and throw for a retryable read
failure. Include the record identity and revision where a successful write changes
the collection; use the same invalidation scope as the owning workflow.

`usePagedContent` and `RemotePagedContent` from `@merit/query/pages` accumulate
pages, retry the failed read, defer remote loading until opened, and hide all
previously loaded entries if a later read denies access. `PagedContent` from
`@merit/ui/paged-content` supplies the presentational loading, retry, and
older-entry controls around capability-owned rendering; static examples can
supply entries directly.
