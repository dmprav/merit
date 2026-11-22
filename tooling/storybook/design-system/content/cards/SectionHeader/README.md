# SectionHeader

A section's heading with an optional count and aside, such as the section's action; like `PageHeader`, it owns the space before the section's content.

- Supply `title`; add `count` for a tabular `muted` count on a `surface-muted` chip, and `aside` for the section's action, pushed to the end of the line.
- `level` (2–5, default 2) keeps the document outline; levels 3 to 5 head nested subsections, such as questions within a submission.
- `emphasis="quiet"` suits the summary sections of a supporting pane, where the content matters more than the headings: `muted` colour at `--text-detail` size.
- `id` lets content refer to the heading; `headingRef` lets a feature return focus to the heading after navigation within the page (the heading becomes programmatically focusable, not a control).
- It sets `space-3` below itself; the title wraps rather than truncating.
- Use `PageHeader` for the page's own title and one labelled action.

Exports: `SectionHeader`.
