# Tabs

Switch between sibling sections of one page while keeping the page's context in view.

- Supply `label` (the tab list's accessible name) and `items` (`{ id, label, content, count?, countWarning?, isDisabled? }`). Tabs keep their supplied order.
- Supply `scrollBackwardLabel` and `scrollForwardLabel`: when the row overflows, these scroll controls reveal neighbouring tabs without selecting them.
- `count` is a number kept separate from the label; zero is shown, and counts are included in accessible names. Features decide what is counted.
- `countWarning` gives the count badge an amber (`warning-subtle`) treatment and supplies its hover explanation and the tab's accessible description; keep the underlying status visible in the panel too.
- Control selection with `selectedKey` + `onSelectionChange`, or start from `defaultSelectedKey`.
- `actions` are panel actions outside arrow-key navigation; they wrap below the strip when space is limited.
- `scrollPanels` lets each panel scroll independently and remembers its position.
- Keyboard: Left/Right moves between tabs (skipping disabled ones); Tab continues through the scroll controls to the panel. Labels may wrap within a tab at narrow widths; counts stay together.
- The selected tab carries an `action` rule over a `border` rail.

Exports: `Tabs`.
