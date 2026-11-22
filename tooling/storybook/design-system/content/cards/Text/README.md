# Text

Gives a run of copy one of the shared text roles; everything else inherits from its surroundings.

- Set `variant`:
  - `supporting` for secondary information, such as a description or the line under a title (`muted`, `--text-detail`).
  - `caption` for a small note, such as a hint near a form or a count (`muted`, `--text-caption`, reading leading).
  - `missing` for a value or list that has nothing to show yet (`muted`).
  - `emphasis` to lift a figure or name within a line (medium weight).
  - `attention` for a figure that needs a decision, such as an amount over budget (`warning`, medium weight); state its meaning in words too.
- `as` picks the element: `span` (default), `p`, `div`, `strong`, `small`, `dd`, `li`, `summary`, or `legend`. Supply `children` and an optional `id`.
- Headings, labels, attribution, and status belong to `SectionHeader`, `DescriptionList`, `Attribution`, `Notice`, and their peers, not Text.

Exports: `Text`.
