# PageHeader

The page's title, context, status and its one main action, at the top of every page's content.

## Usage

- Supply `title`; it is the page's `h1`. Long titles wrap.
- Add `kicker` for the kind of record ("Funding round"), `description` for a short muted line of context, and `status` (usually a `Badge`) beside the title, outside its accessible name.
- Put exactly one labelled action in `actions` — the page's main next step. Further commands go in an icon-only "More actions" `ActionMenu` beside it; Storybook tests reject a second labelled action.
- Use `density="compact"` for reference workspaces and dense tools; the default is `"comfortable"`.
- Compose `InlineName` as the `title` to rename the record in place; the title row gives the editor room.
- Use `SectionHeader` for sections beneath it, not a second PageHeader.
- Spacing comes from the header: `space-7` below (`space-6` compact), `space-2`–`space-4` between parts. Do not add margins around it.

## Exports

- `PageHeader` — props `title`, `status?`, `kicker?`, `description?`, `actions?`, `density?: "comfortable" | "compact"`
