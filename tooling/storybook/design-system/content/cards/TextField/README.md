# TextField

Enter free text in one line or several, with the shared label, description, and validation feedback.

- Use `DateField`, `MoneyField`, `SearchField`, or `Select` when the value has that shape, and `@merit/forms` to connect the field to a form's validation and submission.
- Supply a localized `label`; set `isLabelHidden` only when nearby text already names the field visibly (the label stays the accessible name).
- `description` gives field-level guidance; `errorMessage` replaces it in the same feedback area, so short errors don't shift the next control. Give empty or malformed values specific corrective messages and preserve entries after a failed save.
- `isRequired` marks input needed by the current action with a quiet "Required" label; leave optional fields unmarked. Read-only and disabled fields omit the marker.
- `isReadOnly` is for values fixed by permissions: it keeps focus and copying on a `surface-muted` surface; explain the restriction in `description`. `isDisabled` is for unavailable interaction.
- `isInvalid`, `validate`, and `validationBehavior` drive error styling (`danger`).
- `prefix={{ text, label, isHidden }}` puts a fixed unit beside a single-line value; its `label` is announced with the field guidance and is never part of the value.
- `multiline` makes a text area (`rows` defaults to 5, 120 px minimum, vertical resize).
- Also: `value`/`defaultValue`/`onChange`, `placeholder`, `type`, `inputMode`, `maxLength`, `minLength`, `autoComplete`, `name`, `id`.
- Labels use control text at medium weight; feedback uses caption text; parts sit `space-1` apart. Inputs use `border-control`, `control-radius`, and `surface`.

Exports: `TextField`.
