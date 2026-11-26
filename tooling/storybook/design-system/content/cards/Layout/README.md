# Layout

Flow primitives for recurring vertical and horizontal arrangement and readable line length inside a component.

- `Stack` arranges direct children vertically with a default `space-4` gap. Set `divided="between"` to rule off entries with a subtle rule centred in each gap. Use `gap={0}` when entries carry their own padding, such as whole-row links.
- `Inline` centres children vertically and wraps them in reading order with a default `space-2` gap. `align`: `start` for a short action at the top of multiline content, `end` for controls sharing the bottom edge of fields, `baseline` for differently sized text. `justify`: `between` separates context from its action; `end` aligns an action group to the end.
- `gap` is a step of the spacing scale (0–8, `space-1` to `space-8`); alignment applies to each wrapped line, so check the wrapped result.
- `Reading` constrains prose to `measure-reading` with reading typography, keeps the line breaks people wrote and wraps long unbroken values. Set `prose={false}` for a short reason inside a compact summary. Constrain the prose, not surrounding actions or columns.
- Choose the element with `as` (`section`, `article`, `ul`, `ol`, `dl`, `p` …) and supply `li` children for lists. The primitives add no headings or landmarks; keep DOM order meaningful.
- They accept semantics (`as`, `id`, `role`, `aria-label`, `aria-labelledby`, `hidden`) but no `className` or `style`; put columns, borders and breakpoints on the feature's own element.
- Use `Divider` for a single rule between blocks.

Exports: `Stack`, `Inline`, `Reading`.
