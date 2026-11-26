# Divider

A decorative rule between blocks of content, such as above a page's secondary actions.

- It spaces itself: `spacing` (a space token, default `6`) sets equal visible space above and below, net of the gap the parent `Stack` already adds.
- `strength="subtle"` (the default) draws a `border-subtle` rule for separation inside a surface. `strength="edge"` draws a full `border` rule for the edge of a surface.
- Use `Stack`'s `divided` option, not repeated Dividers, for rules between list entries.
- It is decorative; headings and landmarks carry the structure.

Exports: `Divider`.
