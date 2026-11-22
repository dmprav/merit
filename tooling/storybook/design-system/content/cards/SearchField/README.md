# SearchField

A scoped search within a collection, with its search icon, input, and clear action sharing one field boundary and focus treatment.

- Supply `label`, which names the collection ("Search applications") and is the accessible name; there is no visible label. `placeholder` (defaults to the label) can describe what matches.
- It is controlled: supply `value` and `onChange`.
- Supply `clearLabel` for the clear action. Clear appears only when there is text and returns focus to the input.
- Escape belongs to the containing panel and does not erase the query.
- `appearance="header"` heads a popover list instead, without a boundary of its own; `field` is the default.
- Also: `isDisabled`, `autoFocus`, `maxLength`.
- Place it in a collection toolbar beside the collection it filters. It uses the shared input treatment (`border-control`, `control-radius`, `surface`).

Exports: `SearchField`.
