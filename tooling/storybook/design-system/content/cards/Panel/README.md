# Panel

A bordered region that groups related content or fields apart from the page around it, such as one criterion's fields or a reviewer's invitation.

- Use Panel when related content or fields need a boundary of their own within the page.
- `as`: `div` (default), `section` for a named region (give it `aria-label` or `aria-labelledby`), or `fieldset` for a group of fields, whose `legend` sits on the border (for example `Text as="legend" variant="caption"`).
- `padding` is a step in the shared spacing scale: `4` (default, `space-4`), `5`, or `6`.
- Arrange the content inside with `Stack`; Panel itself only draws the `border` hairline with `panel-radius`.
- Supply `children`; `id` is available for labelling references.

Exports: `Panel`.
