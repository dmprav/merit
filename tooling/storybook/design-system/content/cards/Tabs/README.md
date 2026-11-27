# Tabs

Switch between sibling sections of one page while keeping the page's context in view.

- Supply `label` (the tab list's accessible name) and `items` (`{ id, label, content, count?, countWarning?, isDisabled? }`). Tabs keep their supplied order.
- Supply `scrollBackwardLabel` and `scrollForwardLabel`: when the row overflows, these scroll controls reveal neighbouring tabs without selecting them.
- `count` is a number kept separate from the label; zero is shown, and counts are included in accessible names. Features decide what is counted.
- `countWarning` gives the count badge an amber (`warning-subtle`) treatment and supplies its hover explanation and the tab's accessible description; keep the underlying status visible in the panel too.
- Control selection with `selectedKey` + `onSelectionChange`, or start from `defaultSelectedKey`.
- `actions` are panel actions outside arrow-key navigation; they wrap below the strip when space is limited.
- `scrollPanels` lets each panel scroll independently and remembers its position.
- Keyboard: Left/Right moves between tabs (skipping disabled ones); Tab continues through the scroll controls to the panel. Long labels stay on one line with an ellipsis, and the shared tooltip shows the full label only when it is cut off; counts stay visible.
- The selected tab carries an `action` rule over a `border` rail. The first label's text aligns with the content's left edge: the tab list is outdented by the tab and label padding, so hover fills extend into the gutter while the rail and the selected rule span the text.
- Panels meet the rail's edges exactly and reserve no scrollbar gutter.

Exports: `Tabs`.
