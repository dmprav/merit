# StateMessage

A centred message in place of content that is missing, empty, loading, or failed.

- Supply `title`, and optionally `description`, `illustration` and `actions`; callers supply translated content and recovery behaviour, and page wrappers own placement and navigation.
- `size="page"` (default) fills a page and renders its title as the page's `h1`.
- `size="compact"` sits inside a surface such as a dialog or search box: its title is not a heading, and a small `Icon` replaces an illustration.
- `tone="danger"` colours the compact icon `danger` for a failure; the text stays neutral (`foreground` title, `muted` description).
- Mark decorative illustrations `aria-hidden`.
- Pass `role="status"` for loading announcements; static recovery messages have no live role.
- Offer a recovery action, such as **Try again**, in `actions`; use a `Link` for a destination.
- Use `Notice` for feedback beside content that is still shown, and `PagedContent` recovery for a collection read.

Exports: `StateMessage`.
