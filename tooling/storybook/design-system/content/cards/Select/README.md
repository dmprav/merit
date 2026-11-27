# Select

Choose a field value from a list of options; the owning form or editing pattern determines when that value is saved.

- Use real links for destinations and `ActionMenu` for commands.
- Supply `label` and `items` (`{ id, label, description?, isDisabled? }`). Give unfamiliar options a short `description` so people can compare meanings before selecting; the closed control shows just the label.
- Control the value with `selectedKey` + `onSelectionChange`, or start from `defaultSelectedKey`. `placeholder` shows when nothing is selected.
- `actions` (`{ id, label, icon?, onAction }`) are related commands below the options, such as adding a missing choice, in a separate footer.
- Options use the shared list row: the selected one shows a checkmark and keyboard focus the shared side marker. Long menus scroll; long selected values truncate in the trigger.
- Use field-level `description` for guidance on the whole choice, not a repeat of the selected option's description.
- `isRequired` shows a quiet "Required" label and is exposed as the trigger's description. `isInvalid` with `errorMessage` shows `danger` feedback; `isDisabled` blocks every option.
- `isLabelHidden` keeps the label as the accessible name when nearby text names the field. `appearance="criterion"` puts the label inside the trigger.
- The popover is the shared popover surface (`surface`, `border-raised`, `popover-radius`, `popover-shadow`), fading in and out. The options are the shared popover scroller: padding sits inside the scroller so its scrollbar runs at the surface edge, and a long list is cut partway through a row so it visibly continues above the footer actions. A listbox with nothing to move to shows the shared focus bar.

Exports: `Select` (and type `SelectProps`).
