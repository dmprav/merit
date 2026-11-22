# Notice

Persistent feedback beside the work it concerns; use `showToast` for an action's outcome instead.

- Set `tone`: `neutral` for information, `success` for a completed action, `warning` for something needing attention, `danger` for a failure. Every tone shows an icon and tints the surface (`surface-muted`, `success-subtle`, `warning-subtle`, `danger-subtle`, with the matching accent for the icon).
- State the meaning and next step in text; colour is supplementary. Keep short messages to one sentence.
- `appearance="inline"` gives quiet icon-and-text feedback inside a task surface, without the tinted fill.
- Use `title` and `actions` for structured recovery feedback. Put every button in `actions`, never in the message, so all notices place their controls the same way; use `Inline` for a wrapping action group.
- `as` sets the message element: `p` (default) for a sentence, `div` for paragraphs, `ul` for a list (give the list an `aria-label`).
- Tone controls appearance only: choose `role` (for example `alert` or `status`) and live announcement yourself when an update needs announcing.
- Shape: `control-radius`, `space-2`/`space-3` padding, `--text-detail` text.

Exports: `Notice`.
