# DateField

A field for a calendar date without a time or time zone: people type `YYYY-MM-DD` or open its calendar and choose a day.

- The controlled `value` is a string. An empty string means no date; incomplete and invalid drafts stay editable so a form can preserve them.
- The caller validates before committing (`calendarDateInputSchema` from `@merit/dates`); calendar selections always emit valid dates.
- Supply `label` and `onChange`; add `description`, `errorMessage`, `isInvalid`, `isRequired`, `isReadOnly` or `isDisabled` as needed. Pass `isDisabled` while saving, including for the portaled calendar.
- For invalid values explain the format and range: "Enter a valid date in YYYY-MM-DD format, within 10 years of the current year."
- The input and calendar button share one field boundary (`control-radius`) and the same label, error, focus and requirement presentation as text fields.
- The compact popup closes on selecting a date, Escape, or a click outside; closing returns focus to its trigger and leaves the input unchanged.
- `showCalendar={false}` hides the popup trigger when composing with a separately displayed `Calendar`; `actions` adds inline actions such as Save and Cancel for a standalone picker.
- In forms use `FormDateField` from `@merit/forms`; for quick single-property edits use `DateChoice`.

Exports: `DateField`.
