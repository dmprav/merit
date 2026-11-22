# DataTable

A labelled table of records with stable row IDs, optional controlled single-column sorting, and informational loading, error and empty states.

- Use it for collections people scan and compare by column; give every record a stable, unique ID through `getRowId` and name the table with `label`.
- Supply `columns` as flat `TableColumn` objects with a unique `id`, a text `header`, and `cell(record)`. Return a component from `cell` when the content uses hooks.
- Shape a column with `layout`: `width` (omit on the main text column so it takes the remaining space), `align: "end"` for numbers, `wrap: false` to keep short values on one line on desktop.
- Mark at most one column `layout.primary` and render a real link in its cell to keep native navigation; rows themselves are not clickable. Use `layout.rowActions` for a row's actions column: its heading is hidden and on mobile the actions sit beside the first cell.
- Enable sorting by passing `sorting` (`TableSorting`): the controlled `value` (`TableSort`: `{ columnId, direction }` or `null` for source order), `onChange`, and localized `labels` (`by`, `original`, `ascending`, `descending`).
- Give a column `sort: { value, compare }` for local sorting of a complete collection, `sort: true` for server sorting with `sorting.manual` on a page already ordered by its server, or omit `sort` for display-only columns. Missing values sort last in either direction; clearing restores source order without mutating `data`.
- A selection for an absent or display-only column falls back to source order until it is valid again.
- Pass `state` (`TableState`: `type` `"loading"` or `"error"`, optional `message`) for informational status above the table; loading sets `aria-busy`, errors announce as an alert in `danger`. Omit `message` when the surrounding toolbar presents the status. Callers own loading, recovery and toolbar actions.
- Keep `data` during a refresh or a recoverable error so people keep their place.
- Use `emptyMessage` for both an empty collection and no matching results, worded for the case ("No projects yet.", "No matching projects.").
- `density` defaults to `comfortable`; `compact` tightens desktop rows only, and mobile keeps room for touch.
- `stickyHeader`: `{ mode: "page", top }` needs columns that fit and ancestors that permit page scrolling (`top` offsets fixed navigation); `{ mode: "table", maxHeight }` makes the table its own named, focusable scroll region. Stacked layouts disable stickiness.
- On narrow containers rows stack into labelled cards and a sort select replaces the column header buttons.
- Look: `text-detail` cells, `text-caption` `muted` headings, `border` row hairlines, `surface-muted` row hover, `space-3`/`space-4` cell padding.

Exports: `DataTable`, `TableColumn`, `TableSort`, `TableSorting`, `TableState`.
