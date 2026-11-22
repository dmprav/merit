# Badge

Short, read-only status or metadata shown beside the item it describes.

- Choose `tone` by meaning: `neutral` (default) for routine states, `success` for confirmed positive outcomes, `warning` for something needing attention, `danger` for failure.
- Keep funding judgments neutral: a recommendation to fund is not a successful system action.
- The visible label carries the meaning without colour; never rely on the tone alone.
- `appearance="badge"` (default) draws a filled shape (`surface-muted` or the tone's `-subtle` colour, `badge-radius`) for compact metadata that needs a distinct shape.
- `appearance="plain"` with a decorative `Icon` before the label gives a quiet status column, coloured `muted`, `warning`, `danger` or `success`.
- Labels wrap when space or enlarged text requires it. Set `lang` when the label's language differs from the surrounding text.
- Use a `Button` or `Link` for an action, and `Notice` for an explanation or recovery step.
- Write labels as short states in sentence case ("Draft", "Awaiting acceptance").

Exports: `Badge`.
