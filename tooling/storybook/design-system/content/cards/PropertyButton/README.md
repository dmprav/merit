# PropertyButton

An editable property value with a visible cue; activating the displayed value opens its editor, which the feature owns along with the commitment.

- Supply the value as `children` and a `label` naming the action and value, such as "Edit budget: €120,000"; it becomes the accessible name.
- `action="edit"` shows a pencil cue for an editor; `action="choose"` shows a down cue for a picker such as a `PopoverDialog` with a `ChoiceList`.
- Use `PersonIdentity` inside it for a person.
- `draftLabel` (for example "Unsaved changes") shows retained unsaved changes beneath the value and joins the accessible name.
- Also accepts `onPress`, `isDisabled`, `autoFocus`, `id`, `ref`, `aria-describedby` and `aria-expanded`.
- It owns wrapping, typography (`--text-detail`), spacing (`space-1`/`space-2` padding, offset to align with surrounding values) and the `muted` cue. Keep these controls aligned with other property values; feature CSS arranges only their container.
- Use `InlineName` for a short name and `DateChoice` for a calendar date. A picker choice can commit immediately when its scope is clear, with feedback and recovery such as undo; return focus to the trigger after choosing.

Exports: `PropertyButton`.
