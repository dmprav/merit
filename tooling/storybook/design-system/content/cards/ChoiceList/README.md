# ChoiceList

A searchable single-choice list for property pickers, such as choosing an application's manager.

## Usage

- Present it inside a `PickerPopover` (or `PopoverDialog`) opened from a `PropertyButton` with `action="choose"`; the popover keeps an accessible name without repeating the field label as a heading.
- Supply `items` as `{ id, label, description?, isDisabled? }`; descriptions show beneath the label in `muted`, and search matches label and description.
- Supply `label` (names the list), `searchLabel` (names the search and shows as its placeholder) and `emptyLabel` (shown when nothing matches).
- Supply `selectedKey` for the current value; it shows a trailing check. Selection calls `onChoose(id)` and commits through the owning workflow — close the picker there.
- Set `isDisabled` while a choice is saving; mark individual unavailable items with `isDisabled`.
- The search sits in the picker header, divided from results, and takes focus on open; results use the shared list row, the same row as Select options and menu items.
- Use `DateChoice` for dates and `CollectionFilter` for filtering a collection.

## Exports

- `ChoiceList` — props `label`, `searchLabel`, `emptyLabel`, `items`, `selectedKey`, `onChoose`, `isDisabled?`
