# SortButton

A column heading that orders its collection.

- Use it in a sortable column header; the data table uses it for sortable columns.
- Supply `children` (the heading) and `onPress`; the table owns the order itself and sets `aria-sort` on its header cell.
- `direction` (`ascending` or `descending`) shows the current direction; leave it unset for an unsorted column, which reveals a sort cue on hover and keyboard focus.
- `align="end"` places the cue before the heading for end-aligned columns such as amounts; `start` is the default.
- It keeps the heading's typography and is built on the quiet button, so hover uses `surface-muted`.

Exports: `SortButton`.
