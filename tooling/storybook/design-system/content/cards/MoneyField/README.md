# MoneyField

A controlled text field for decimal money amounts that rejects invalid input without rounding.

- Use it for amounts such as a proposed allocation; use `FormMoneyField` from `@merit/forms` with a shared form.
- It is controlled: supply `value` (decimal text) and `onChange`. It accepts decimal commas and grouped paste with a decimal point, and normalizes accepted values on blur.
- Supply `precisionMessage`: localized feedback announced beside the input when typing is rejected for excess precision.
- Supply the currency through `prefix={{ text: "€", label: "Euros" }}`; the prefix is announced but never part of the value.
- Restored invalid values (for example `123.456`) stay exact and editable until corrected; pair them with `isInvalid` and `errorMessage`.
- The feature keeps responsibility for required amounts, allowed funding positions, and save validation.
- Accepts the other TextField props (`label`, `description`, `isRequired`, `isReadOnly`, `isDisabled`, `isLabelHidden`, `onBlur`, …), except `defaultValue`, `inputMode`, `multiline`, and `rows`.
- Shares TextField's look: `border-control`, `control-radius`, `danger` for errors.

Exports: `MoneyField`.
