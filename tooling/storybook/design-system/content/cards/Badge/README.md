# Badge

A short, read-only status shown beside the item it describes. Status only: show a date, count or other metadata with `MetaItem`.

- Choose `tone` by meaning: `neutral` (default) for routine states, `success` for confirmed positive outcomes, `warning` for something needing attention, `danger` for failure.
- Keep funding judgments neutral: a recommendation to fund is not a successful system action.
- The visible label carries the meaning without colour; never rely on the tone alone.
- `appearance="badge"` (default) draws a filled shape (`surface-muted` or the tone's `-subtle` colour, `badge-radius`) for a status that needs a distinct shape.
- `appearance="plain"` gives a quiet status column, coloured `muted`, `warning`, `danger` or `success`. It draws the tone's icon from the shared tone icons (`attention`, `failure`, `success`); a neutral status shows none unless you pass `icon`, such as `clock`.
- `children` is a `string`: the label. Put no icons, dates or other elements in it.
- Labels wrap when space or enlarged text requires it. Set `lang` when the label's language differs from the surrounding text.
- Use a `Button` or `Link` for an action, and `Notice` for an explanation or recovery step.
- Write labels as short states in sentence case ("Draft", "Awaiting acceptance").

Exports: `Badge`.
