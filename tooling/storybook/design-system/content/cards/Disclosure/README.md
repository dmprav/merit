# Disclosure

A quiet heading that expands supporting material people inspect occasionally, such as earlier versions.

- Use it only for material that would otherwise crowd the task; keep what a decision needs visible.
- Supply `title` and `children`. `count` shows how many entries the panel holds beside the title (it is part of the accessible name, "Earlier versions 2").
- `headingLevel` (2, 3 or 4; default 3) fits the heading into the page outline.
- It starts collapsed; set `defaultExpanded` to start open, and `onExpandedChange` to observe changes.
- The trigger is a `muted` button with a turning chevron, `surface-muted` hover, `control-radius` corners and a `target-touch` target.
- Not for navigation or switching views: use `Tabs` or links.

Exports: `Disclosure`.
