# ReferenceWorkspace

A frame for sustained work beside reference material, such as assessing an application or drafting a recommendation, so the reference stays readable while the work stays in reach.

- Place it in a contained `ApplicationPage`. On desktop the header stays put and each pane scrolls on its own; narrow and short screens stack the panes in reading order.
- `header` takes a compact `PageHeader` with the facts people need while working; put occasional, consequential actions in its **More actions** menu.
- `toWorkLabel` and `toReferenceLabel` name the links that move between stacked panes. `after` holds content outside both panes, such as page-wide feedback.
- Both panes use the dialog frame's anatomy: a header bar, one scrolling body, and a footer. The bars share one height so their rules line up across the split, both bodies start at the same distance below them, and pane headers keep their rule at rest (footers show an edge only while content continues below).
- `ReferencePane` holds the material people consult: `label` names its keyboard-focusable scroll viewport and is the header's title when there is no `toolbar`, `toolbar` holds persistent controls in the header bar, `viewportRef` receives the viewport. Do not repeat the label as a heading in the content.
- `ReferenceSwitcher` chooses the material when there is more than one kind: `label`, `triggerLabel` (names the trigger with the current choice, such as "Reference material: Guidelines"), `options`, `selected`, `onChange`, `triggerRef`. Keep it in the same place when reading and editing, and keep each choice mounted with `hidden`.
- `WorkPane` holds the task: `label`, `title` (the header always shows it, or `label` when omitted) with optional `titleActions` (shown only with a `title`), `titleMeta` and `titleRef`, and `footer` to keep status and the commitment action visible (sticky at the bottom on stacked screens). Use `fill` when the child, such as a `Form`, owns its scrolling and actions. `as="section"` when the work is the page's main task; the default `aside` when it supports the reference.
- Supply a `WorkPane` alone when there is no reference material; it then uses the full width. Reserve dialogs for short actions.
- `useReferenceViewport(initial)` tracks the chosen reference and restores each one's scroll position; `moveReference` focuses the viewport unless called with `focusViewport: false`.
- `useReadingNavigation` visits details within a pane and returns through their reading positions (`root`, `heading`, `open`, `back`, `reset`, `previous`); the feature owns destinations and labels.
- Panes are divided by `border` rules; headers and footers sit on `surface`.

Exports: `ReferenceWorkspace`, `ReferencePane`, `WorkPane`, `ReferenceSwitcher`, `useReferenceViewport`, `useReadingNavigation`, `stackedPanesQuery`.
