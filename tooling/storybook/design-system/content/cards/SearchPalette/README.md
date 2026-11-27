# SearchPalette

A search field above links and actions, optionally grouped, for jumping to funding rounds, applications and other workspace records.

- The field keeps focus. The top match is highlighted when settled results arrive, Up and Down move through every row across groups, and Enter opens the highlighted row. Navigation rows are real links, so the browser handles modifier and middle clicks.
- Supply `label` (names the field), `resultsLabel` (names the list), `value`, `onValueChange`, `groups`, `announcement` and `announcementId`; optional `placeholder`, `maxLength`, `inputRef`, `resultsId`.
- Each `SearchPaletteGroup` has `id`, `items` and an optional `heading` with `note`, such as "Showing 3 of 43 applications. Type more to narrow."
- Each `SearchPaletteItem` has `id`, `textValue` (the row as plain text), `title`, optional `detail`, `label` and `icon`, and either `href` with `renderLink` (the router's link) or `onAction`.
- `busy` keeps previous rows visible but disabled while results are replaced, except items marked `availableWhileBusy`.
- `message` replaces the results with guidance, an empty result or a failure, such as a compact `StateMessage`; `feedback` shows recovery or truncation alongside usable results; `keyboardHelp` labels the ↑↓, Enter and Esc hints in the footer.
- `announcement` is spoken politely through `StatusMessage`; change `announcementId` so repeated text counts as new.
- `onOpen` reports a row opened in this tab; `onEscape` dismisses even with text in the field.
- Host it in `SearchPaletteDialog`: a search box near the top of the page with no visible title bar. `title` names the dialog, `closeLabel` the floating close control; outside presses dismiss unless `isDismissable` is false; up to 600px wide it fills the screen.
- Shape: `panel-radius`, `popover-shadow`, `surface`; rows are the shared list row: a hovered row and the top match highlighted as results arrive use `surface-muted`, and a row moved to with the arrow keys uses `action-subtle` with the shared focus bar. The field takes the shared focus bar under it, and group headings share the rows' left edge.

Exports: `SearchPalette`, `SearchPaletteDialog`, `SearchPaletteItem`, `SearchPaletteGroup`, `SearchPaletteLinkProps`.
