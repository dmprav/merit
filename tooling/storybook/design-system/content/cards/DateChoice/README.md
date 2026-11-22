# DateChoice

A calendar-date picker for one property, combining a typed date field with check and × controls, a calendar, and a Clear action.

## Usage

- Use it for a single calendar date such as a committee date; present it in a `PickerPopover` like other small pickers. It supplies its own Cancel control.
- Supply `value` (`YYYY-MM-DD` or `null`), `label`, and `onChoose(value | null)`; picking a day or clearing commits immediately through the owning workflow.
- Typed dates apply with the check control (`applyLabel`) or Enter; the × control (`cancelLabel`) calls `onCancel`, abandoning this small edit.
- Supply `invalidMessage` for a typed value that is not a valid date; the unsuccessful choice stays visible for retry.
- Supply `clearLabel` for the quiet Clear action, disabled when there is no date.
- Set `isDisabled` while a choice is saving or unavailable.
- The feature owns saving, conflicts and revision-checked undo; explain further consequences before commitment.
- The field takes focus on open; icon controls carry accessible names and tooltips.

## Exports

- `DateChoice` — props `value`, `label`, `clearLabel`, `applyLabel`, `cancelLabel`, `onCancel`, `invalidMessage`, `onChoose`, `isDisabled?`
