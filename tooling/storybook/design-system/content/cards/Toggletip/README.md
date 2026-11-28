# Toggletip

An info icon that explains something brief beside a value. Every info icon in Merit is a toggletip, so they all behave alike.

- Supply `label`, the icon button's accessible name that names the topic ("About this request"), and `children`, plain or short inline text.
- Hover opens it after the shared tooltip delay and keyboard focus opens it at once. The pointer can move onto the text without it closing.
- Press or tap pins it open. Escape, or a press outside, closes it, including while the pointer is over the text.
- The text is a non-modal popover on the shared popover surface, not a tooltip, so it can be read and selected.
- `tone="info"` (default, `info` icon) for supporting context; `tone="warning"` (`attention` triangle) for a qualification the reader should not miss. Icons come from the shared tone icons.
- Anything needed to finish a task belongs visible beside it, not behind an icon. Use `Tooltip` to name an icon-only action, and `StatusIndicator` for a status qualification.
- Forced colors keep the icon and surface visible; on coarse pointers the button widens to `target-touch`.

Exports: `Toggletip`.
