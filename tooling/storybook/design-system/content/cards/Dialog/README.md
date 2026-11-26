# Dialog

The frames for a focused task or reference material that should preserve the surrounding work; choose the frame by what the person needs to do.

- `ModalDialog`: a centred dialog for a bounded task, such as reading short information or a submitted record. Forms use `FormDialog`; consequential actions use `ConfirmationDialog`.
- `SidePanel`: records related to a row, in a full-height panel at the end edge (full screen up to 600px). Keep related records as native links.
- `PopoverDialog`: reference material beside a value, with a persistent heading and close control; pass content directly (it supplies its own body), `headerActions` and an optional `footer` for utilities.
- `PickerPopover`: a picker or small filter panel. Its `title` names it without a visible header or close control; it dismisses with Escape or an outside press.
- Frames have no visual options; a new task gets a new frame, not an option on an existing one.
- Supply `title`. `ModalDialog` and `SidePanel` take a `trigger` or controlled `isOpen`/`onOpenChange` (`defaultOpen` also works); omit `trigger` for a dialog the feature opens itself, and focus returns to where it was. `PopoverDialog` and `PickerPopover` always need a `trigger` to anchor to, and can add controlled `isOpen`/`onOpenChange`.
- For work within a fixed parent, add `context` and a localised `contextLabel` ("Round: Community grants").
- Inside `ModalDialog` and `SidePanel`, put the body in `DialogContent`: `children` scroll, `feedback` stays above the `footer` actions, `reading` sets reading typography, `label` renames the scroll region. Group content with `DialogSection` (`title`, `children`).
- The close control is labelled "Close dialog"; pass `closeLabel` only for a more specific name. `isDismissable` enables backdrop dismissal; `isDismissDisabled` guards close, Escape and outside dismissal together while an operation must stay visible.
- `FrameFooter` (`feedback`, `sticky`, `framed`) is the fixed footer area shared by every frame: feedback above the actions, with an edge that shows while content continues below. Dialogs, popovers and the assistant panel get it through `DialogContent`; use it directly only where a surface's own body scrolls around it, as `Form` does with `stickyActions` in a workspace pane (`sticky`). `framed` (default) gives it the frame's gutters. Below 30rem of viewport height a centred dialog or side panel scrolls as a whole, so its footer scrolls with the content there; don't rely on actions staying in view at those heights. The assistant panel's footer stays fixed at every height.
- Surfaces use `surface`, `panel-radius` and `dialog-shadow` (popovers `popover-shadow`); focus is contained and returns to the trigger.

Exports: `ModalDialog`, `SidePanel`, `PopoverDialog`, `PickerPopover`, `DialogContent`, `DialogSection`, `FrameFooter`.
