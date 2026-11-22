# FormFields

Field adapters that connect shared text, money, date and select controls to a `useForm` field's value, validation and pending state.

- Use these inside a `Form` built with `useForm`; render each within `form.Field` and pass its render argument as `field`. Use the plain `TextField`, `MoneyField`, `DateField` and `Select` outside a shared form.
- Each adapter supplies the value, change and blur handlers, `name`, `isInvalid`, `errorMessage` and `validationBehavior`; do not pass those. Supply the remaining control props, such as `label`, `description`, `isRequired` and `isLabelHidden`.
- `FormTextField`: string field; supports `multiline` and `rows`, and still calls your `onBlur`.
- `FormMoneyField`: decimal money text; supply `prefix` (for example `{ text: "€", label: "Euros" }`) and `precisionMessage`.
- `FormDateField`: ISO date text with a calendar popup; the calendar is always available.
- `FormSelect`: supply `items`; the field value is the selected item's `id`.
- Errors appear after the field is touched or the form is submitted, announced as an alert beside the field in `danger`; `Form` then focuses the first enabled invalid control.
- Fields inherit `Form`'s pending state, including open select options and calendars; use `isDisabled` only for additional restrictions.
- Give empty or malformed values specific corrective messages in the schema ("Enter a title.", "Enter a valid date.") and preserve entries after an unsuccessful save.
- Field parts use `space-1` gaps; `Form` separates fields by `space-2`.

Exports: `FormTextField`, `FormMoneyField`, `FormDateField`, `FormSelect`.
