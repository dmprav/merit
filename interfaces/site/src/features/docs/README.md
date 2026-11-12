# Author a public guide

Start with the reader's task and describe supported behavior. Follow the
[documentation guidance](../../../../../docs/guides/documentation.md) for scope,
language, and the distinction between public guides and contributor workflows.

## Compose the page

Keep each guide in its own component. Shared article and navigation styles live in
`docs.module.css`; page-specific arrangements belong in a CSS Module beside their
page, as with the docs homepage and MCP connection controls.
Use [DocsArticle](docs-layout.tsx) with an explicit section list: it renders
headings and article contents from the same list. Give sections stable IDs so
links from the application can reach the relevant answer. Contents highlight the
section being read without changing the URL during scrolling; the
[section-tracking hook](use-active-doc-section.ts) owns heading measurements and
browser subscriptions. Selecting a section updates its fragment and focuses its
heading in `DocsArticle`; compact contents close before the browser scrolls to it.
On short pages, keep that focused section selected when the page ends before its
heading can reach the top reading position.

Keep each page's title, description, and section copy together in
[messages.en.ts](messages.en.ts), with reusable copy in `shared`. This catalog
is composed into the site catalog; navigation and route metadata use the same
titles and descriptions.

For a new topic, add it to [docs-navigation.ts](docs-navigation.ts) and create a
route in `../../routes`. Wrap the guide in `DocsLayout` so the translation provider
surrounds its content. The [round guide](round-guide.tsx) and its
[route](../../routes/docs.rounds.tsx) demonstrate the arrangement. Choose a useful
next topic rather than requiring readers to return to the index.

Keep prose within the shared reading measure while allowing tables and interactive
examples to use the article width. Break longer explanations into task-based
subheadings, and use `Trans` to emphasize exact control names where it helps
readers follow a step. Supporting notes use the neutral `note` style; add
`data-tone="warning"` when the reader needs to consider a consequence, such as
making earlier judgments outdated or saving changes through a connected client.
Use the `amount` table-cell style for aligned monetary values.

## Illustrate and verify

Use written steps, comparison tables, and worked examples with fictional data.
For focused visual examples, compose existing shared UI components when they help
explain the task. Reuse feature components through explicit capability exports such as
`@merit/grantmaking-web/examples/recommendation` when readers benefit from trying the actual controls. The capability owns these
self-contained examples and their translation providers; use fictional data and
page-local state, with no workspace requests or browser storage. Explain what to
try and when changes reset. The [recommendation guide](recommendation-guide.tsx)
uses the real editor, summary, validation, and budget preview this way.
Its editor uses `showActionLabel` so readers can discover the edit action without
recognizing the pencil icon. It retains the editor's draft and focus behavior.

Link to the live demo when readers need to see or try a complete
flow. Keep public guides free of product screenshots so instructions remain
readable at every size and easier to maintain as the interface changes.

Run `vp run test:browser:app` from the repository root after the
[browser setup](../../../../../docs/guides/verification.md#verification). The
[application suite](../../../../../app/tests/browser/application.spec.ts) checks documentation
navigation and interactions. When changing a guide, check its topic links,
section anchors, keyboard access, and narrow-screen layout. The topic navigation
and article contents collapse independently. Check that consulting help from the
application preserves unfinished work.
