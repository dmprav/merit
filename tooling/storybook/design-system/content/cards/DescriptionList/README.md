# DescriptionList

Label/value pairs with native `dl`, `dt` and `dd` semantics, for the facts of a record.

- Compose `DescriptionList` with `DescriptionListItem` children; each item takes `label` and its value as `children`. `labelId` names the label so a control in the value can refer to it.
- Choose `layout` by how people read the facts:
  - `stacked` (default): descriptive facts, labels above values.
  - `rows`: compact property panels, labels beside values; rows stack again in containers narrower than 17rem.
  - `columns`: a short summary of separate facts, side by side where there is room.
  - `figures`: amounts to compare, values aligned at the end in tabular figures.
- Set `divided` to rule off each item with `border`, for a record people edit row by row.
- The list owns typography (labels in `muted`), item spacing (`space-1` to `space-6`) and wrapping. Values share a 32px minimum row with text, identities and controls vertically centred; long content grows.
- Features supply labels, values, formatting and conditional items, and keep the list's width and surrounding panels.
- Use `Badge` for statuses and `PersonIdentity` for people inside values.

Exports: `DescriptionList`, `DescriptionListItem`.
