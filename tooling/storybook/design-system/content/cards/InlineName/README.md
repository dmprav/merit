# InlineName

A heading-sized editor for renaming a record in place, such as a funding round's title.

## Usage

- Use it for a short name; use `DateChoice` for a calendar date and `PropertyButton` for other single properties.
- At rest it is a quiet button showing `value` with a pencil cue; its accessible name is the value and `label` describes the action ("Rename round").
- Editing shows a text field (max 200 characters) with check (Save) and × (Cancel) icon controls carrying `saveLabel` and `cancelLabel` as names and tooltips.
- Enter saves and Escape cancels; leaving the field keeps the draft — blur never saves.
- Supply `onSave(value)` returning a promise of `null` on success or an error message; a thrown error shows `errorMessage`. The error appears as an alert and the draft stays for retry.
- Saving an unchanged name just closes; an empty name cannot be saved.
- Set `isPreparing` while a draft is restored to show `EditorLoading` with a Close control; set `isDisabled` when renaming is unavailable.
- Place it as a `PageHeader` `title` so it takes heading size; focus returns to the name after closing.
- The error uses `danger` in `text-detail`; the field underline uses `focus`.

## Exports

- `InlineName` — props `value`, `label`, `saveLabel`, `cancelLabel`, `errorMessage`, `onSave`, `isDisabled?`, `isPreparing?`
