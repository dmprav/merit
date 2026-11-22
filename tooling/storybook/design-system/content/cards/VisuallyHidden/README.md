# VisuallyHidden

Content for assistive technology only, such as a heading that names a region whose purpose the layout already shows.

- Prefer visible text. Reach for VisuallyHidden only when a visible label would repeat what the layout already makes clear.
- For field labels, use the field's `isLabelHidden` instead; it keeps the label as the accessible name with its validation and requirement semantics.
- `as`: `span` (default), `div`, `h2`, or `h3`. Use a heading element when it names a region.
- Supply `children` and an `id` when another element references it, for example `<section aria-labelledby="history-title">` with `VisuallyHidden as="h2" id="history-title"`.

Exports: `VisuallyHidden`.
