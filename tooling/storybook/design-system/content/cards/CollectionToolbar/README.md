# CollectionToolbar

Keeps a labelled Filter action, active filter chips, scoped search and the result count together above a table or chronological list.

## Usage

- Supply `filterLabel` for the Filter button and `filterTitle` as the filter panel's accessible name.
- Put the collection's criteria in `filters` as `CollectionFilter` rows (`label`, `items`, `selectedKey`, `onSelectionChange`, `isDisabled?`); show every available criterion, with an unrestricted value such as "All projects". Selection applies immediately and keeps the panel open.
- Supply `chips` for active filters as `{ id, label, removeLabel, onRemove }`; each is a quiet removable chip with an explicit accessible removal label. Removing a chip returns focus to Filter.
- Supply optional `search` (`label`, `clearLabel`, `placeholder?`, `maxLength?`, `value`, `onChange`); it sits above the criteria and a populated query stays visible as a removable chip.
- Supply `reset` (`label`, `onReset`, `isDisabled?`); it appears in the panel only while criteria or search are active. The feature decides what can be reset.
- Supply `summary` for the count ("5 of 12 projects"); it is a `role="status"` region, so keep it accurate for the loaded scope.
- Escape and outside presses close the panel without changing values. The toolbar does not fetch, paginate, store queries or write them to the URL — the feature owns that state.
- Chips use `text-caption` and `muted`; spacing uses `space-1`–`space-3`.

## Exports

- `CollectionToolbar` — props `filterLabel`, `filterTitle`, `filters`, `chips?`, `reset?`, `search?`, `summary?`
- `CollectionFilter`
