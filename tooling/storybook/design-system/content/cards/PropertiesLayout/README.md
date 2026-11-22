# PropertiesLayout

A record's main work beside a panel of its properties, such as a funding round's purpose and budget.

- Supply the main work as `children` and the panel as `properties`, usually a `DescriptionList` with `layout="rows"` or editable property rows.
- `propertiesLabel` names the panel, rendered as an `aside` landmark (for example "Round properties").
- On wide screens the panel sits after the work in a 320px column, separated by a `border` rule with `space-7` between them and `space-6` inside the rule.
- On narrower screens (up to 1350px) the panes stack. `stackedPlacement="before"` (default) moves the panel before the work; use `"after"` when the work is a long collection people came to scan. A `border` rule with `space-5` separates them in either arrangement.
- The panel stays mounted when changing sections moves it across the main content.
- Use `DescriptionList` for read-only facts and keep editable rows with their editing component (`PropertyButton`, `InlineName`, `DateChoice`); a description term alone does not label an input.
- For reading and writing at the same time, use `ReferenceWorkspace` instead.

Exports: `PropertiesLayout`.
