# ConflictRecovery

Warning notices and inline comparisons that let people resolve a save or basis conflict, or keep unsaved writing when an editor can no longer save.

- Place `ConflictBanner` above an editable form when the record changed while someone was editing (a save conflict) or the material their draft depends on changed (a basis shift).
- Supply `title` and `message`, plus optional `attribution` naming who changed it and when (shown in `muted` caption text).
- Offer the resolutions as `keepMine` and `useSaved`, each `{ label, onPress }`, with specific labels such as "Save my changes over latest" and "Discard & load latest". Set `isDisabled` while a resolution is in progress.
- Pass `latest` (`toggleLabel`, `hideLabel`, optional `heading`, `children`) to let people view the latest saved content; it opens outside the warning notice in a `border` panel with `panel-radius` on `surface`.
- The banner announces as an alert with the `warning` tone; its buttons sit in the notice's actions.
- Put `SavedValue` directly after a field's control when the draft differs from the latest saved version, so the comparison sits where people edit. Supply `label` (for example "Now saved as") and the saved value as `children`; the label uses `warning`, the value `muted` caption text.
- Use `RetainedDraftNotice` when access is lost, the record is deleted, or it is withdrawn: supply `title`, `message` and `textToCopy`, and render the retained writing as `children` below the notice.
- Copy uses the clipboard and confirms with a success or danger toast. Copy, copying, copied, copy-failed and discard labels default to shared messages; override with `copyLabel`, `copyingLabel`, `copiedLabel`, `copyFailedLabel` and `discardLabel`.
- Pass `onDiscard` to offer discarding the draft; omit it to offer only Copy. `isDisabled` blocks both actions.
- Space the parts with `space-3`.

Exports: `ConflictBanner`, `RetainedDraftNotice`, `SavedValue`.
