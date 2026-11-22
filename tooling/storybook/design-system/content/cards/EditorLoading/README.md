# EditorLoading

Compact recovery feedback shown inside an editor while its draft is being restored, with `EditorClose` to leave the editor meanwhile.

## Usage

- Render `EditorLoading` inside the editor's existing padded body while a local draft is restored ("Preparing editor…", "Checking for unfinished changes."). It is a `role="status"` region.
- Keep the editor's title and Close action available while it shows; the person can leave and keep reading saved work.
- Alone in a dialog body it centres in a stable space, and it fades in after a short delay so quick recoveries do not flash.
- Use `EditorClose` to close an inline editor by pointer or Escape. Supply `label` and `onClose`; set `iconOnly` for a × control (the label becomes its accessible name).
- `EditorClose` takes focus by default (`autoFocus`) so Escape works while fields are unavailable; set `autoFocus={false}` when something else should hold focus.
- Use `isDisabled` on `EditorClose` to share the editor's pending guard so a save in progress cannot be hidden.
- Closing preserves the draft; Discard is a separate action (see the editing pattern).
- Copy comes from the shared `common` messages, so render inside `Provider`.

## Exports

- `EditorLoading` — no props
- `EditorClose` — props `label`, `onClose`, `iconOnly?`, `autoFocus?`, `isDisabled?`
