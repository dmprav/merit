# Disclosure

A quiet heading that expands supporting material people inspect occasionally, such as earlier versions.

- Use it only for material that would otherwise crowd the task; keep what a decision needs visible.
- Supply `title` and `children`. `count` shows how many entries the panel holds beside the title (it is part of the accessible name, "Earlier versions 2").
- `headingLevel` (2, 3 or 4; default 3) fits the heading into the page outline.
- It starts collapsed; set `defaultExpanded` to start open, and `onExpandedChange` to observe changes.
- The whole row is the trigger: a `muted` button with the chevron first, turning with `motion-fast`, a `surface-muted` hover that bleeds past the content edge, `control-radius` corners and a `target-touch` target. The panel opens with a height animation (none under reduced motion) and its content lines up with the title; set `indent={false}` for content with its own leading icons.
- Not for navigation or switching views: use `Tabs` or links.

Exports: `Disclosure`.
