# InlineName

A heading-sized editor for renaming a record in place, such as a funding round's title.

## Usage

- Use it for a short name; use `DateChoice` for a calendar date and `PropertyButton` for other single properties.
- At rest it is a quiet button showing `value` with a pencil cue; its accessible name is the value and `label` describes the action ("Rename round").
- Editing shows a text field (max 200 characters, wrapping like the name and never truncated) that takes exactly the name's box, with no layout shift and no Save or Cancel buttons. A trailing slot shows the pencil, a spinner while pending, or a failure glyph.
- Enter or leaving the field saves; Escape reverts. Enter and Escape keep or return focus to the name; leaving the field leaves focus where the person put it.
- Supply `onSave(value)` returning a promise of `null` on success or an error message; a thrown error shows `errorMessage`. The error is an alert caption below the field that overlays the content; the draft and focus stay for retry.
- An unchanged or empty name reverts without saving.
- Set `isPreparing` while a draft is restored to show the field read-only with a spinner; set `isDisabled` when renaming is unavailable.
- Place it as a `PageHeader` `title` so it takes heading size.
- The error uses `danger` in `text-detail`; the focus underline uses `focus`.

## Exports

- `InlineName` — props `value`, `label`, `errorMessage`, `onSave`, `isDisabled?`, `isPreparing?`
