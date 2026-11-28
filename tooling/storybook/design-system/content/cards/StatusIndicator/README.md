# StatusIndicator

A small icon after a value that offers a brief status qualification, such as an earlier recommendation, on hover, keyboard focus and tap. It is a preset of `Toggletip`.

- Place it after the value it qualifies; keep the status itself visible.
- Supply a specific `label` (the icon button's accessible name) and a localized `explanation` of one or two sentences; the feature owns its meaning.
- The explanation appears once, on hover or focus, and stays open when pressed or tapped. Escape and outside press dismiss it.
- `tone="warning"` (default, `attention` triangle) for a qualification that needs attention; `tone="muted"` (`info` icon) for neutral supporting context.
- Substantial evidence belongs in the owning workflow. Keep consequences that change an editing decision visible beside that action instead of hiding them in an indicator.
- `StatusIndicatorSpace` reserves an indicator's width where a value has none, so values in a column of figures line up.
- On coarse pointers the trigger (and `StatusIndicatorSpace`) widens to `target-touch`.

Exports: `StatusIndicator`, `StatusIndicatorSpace`.
