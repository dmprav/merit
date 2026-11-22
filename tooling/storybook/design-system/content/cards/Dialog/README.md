# Dialog

The frames for a focused task or reference material that should preserve the surrounding work; choose the frame by what the person needs to do.

- `ModalDialog`: a centred dialog for a bounded task, such as reading short information or a submitted record. Forms use `FormDialog`; consequential actions use `ConfirmationDialog`.
- `SidePanel`: records related to a row, in a full-height panel at the end edge (full screen up to 600px). Keep related records as native links.
- `PopoverDialog`: reference material beside a value, with a persistent heading and close control; pass content directly (it supplies its own body), `headerActions` and an optional `footer` for utilities.
- `PickerPopover`: a picker or small filter panel. Its `title` names it without a visible header or close control; it dismisses with Escape or an outside press.
- Frames have no visual options; a new task gets a new frame, not an option on an existing one.
- Supply `title`, and either `trigger` or controlled `isOpen`/`onOpenChange` (`defaultOpen` also works). Omit `trigger` for a dialog the feature opens itself; focus returns to where it was.
- For work within a fixed parent, add `context` and a localised `contextLabel` ("Round: Community grants").
- Inside `ModalDialog` and `SidePanel`, put the body in `DialogContent`: `children` scroll, `feedback` stays above the `footer` actions, `reading` sets reading typography, `label` renames the scroll region. Group content with `DialogSection` (`title`, `children`).
- The close control is labelled "Close dialog"; pass `closeLabel` only for a more specific name. `isDismissable` enables backdrop dismissal; `isDismissDisabled` guards close, Escape and outside dismissal together while an operation must stay visible.
- Surfaces use `surface`, `panel-radius` and `dialog-shadow` (popovers `popover-shadow`); focus is contained and returns to the trigger.

Exports: `ModalDialog`, `SidePanel`, `PopoverDialog`, `PickerPopover`, `DialogContent`, `DialogSection`.
