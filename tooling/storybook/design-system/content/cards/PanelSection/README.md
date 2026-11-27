# PanelSection

Arranges supporting side-panel sections with equal `--space-section` spacing, quiet section headings, optional counts and status summaries, and quiet end-edge actions.

## Usage

- Group sibling sections inside `PanelSections` so vertical rhythm stays consistent across panels.
- Use `PanelSection` for each summary block with `title`, optional `count`, one supporting `meta` line, and quiet `actions` such as an edit icon button or secondary trigger.
- Keep section content flush with the heading; use `Judgment`, `JudgmentChoice`, or `DescriptionList` inside `children`.

## Exports

- `PanelSections` — props `children`
- `PanelSection` — props `title`, `count?`, `actions?`, `meta?`, `headingRef?`, `children?`
