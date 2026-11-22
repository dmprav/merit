# PagedContent

A paged collection, such as an application's history, that renders loaded entries and owns their loading, failure, denial and "load more" states; static examples and authorized remote pages share the same presentation.

- Supply `entries` and a render function as `children(entries, hasMore)`; the feature draws the entries (for example a `Timeline`).
- With no remote flags (`loaded` defaults to true) it renders the entries directly, with no status line or buttons.
- `pending` before the first page shows a `role="status"` line ("Loading history…").
- `hasMore` with `more` adds a quiet **Load older entries** button below the page; `fetching` marks it pending.
- `failed` with `retry`: when earlier entries are on screen they stay usable and a danger toast offers **Try again** (render `Toasts` once at the root); after the toast is dismissed a quiet **Try again** stays in place. When nothing could be shown, recovery is a danger `Notice` with a **Try again** button beside the page controls.
- A retry in progress (`failed` then `fetching`) shows as a status line until it settles; announce completion from the caller.
- `denied` hides the entries and every control behind a neutral `Notice` ("This history is no longer available.").
- `labels` overrides the history copy (`loading`, `failed`, `unavailable`, `more`, `retry`) when paging another collection.
- `CollectionRecovery` is the same recovery on its own: `message`, `retryLabel`, `onRetry`, `isPending`, `showsEntries`. `useCollectionRecovery(failed, fetching)` keeps recovery visible while an initial retry settles.
- `PagedContentState<T>` types the controller state a feature passes through.
- Spacing: recovery sits `space-3` from the page.

Exports: `PagedContent`, `CollectionRecovery`, `useCollectionRecovery`, `PagedContentState`.
