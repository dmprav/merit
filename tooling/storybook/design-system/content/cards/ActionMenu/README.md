# ActionMenu

A menu of secondary commands behind a trigger; use it when a command is useful but should not compete with the visibly labelled actions on the surface.

- Keep important actions in visibly labelled `Button`s. Items invoke callbacks only: use real links for destinations and `Select` for field values.
- Supply `label` (the menu's accessible name), `trigger` (usually a quiet, icon-only `Button` with an `aria-label` such as "More actions"), `items` and `onAction(id)`.
- Each item is `{ id, label, icon? }`. Give every item an icon or none, so labels stay aligned.
- `activation="press"` (default) opens below the trigger, aligned to its end. `activation="contextMenu"` wraps a real link: it keeps the link's normal navigation and opens on right-click or long-press; pair it with `tooltip` to hint that the menu exists.
- The menu sits on `surface` with a `border`, `control-radius` corners and `popover-shadow`; items use the shared list-row hover and focus treatment.
- Keyboard: Enter or Space opens the menu and focuses the first item; Escape closes it and returns focus to the trigger.
- Write item labels as verbs naming the outcome ("Copy link", "Discard draft"), sentence case.

Exports: `ActionMenu`.
