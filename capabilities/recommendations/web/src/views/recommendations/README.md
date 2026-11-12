# Compose recommendations and budget help

Use this guide when changing the recommendation overview or editor. The
[recommendation workflow](../../../../../../docs/workflows/recommend-funding.md)
owns funding positions, budget calculations, provenance, and save guarantees.
The [save walkthrough](../../../../../../docs/guides/recommendation-walkthrough.md)
follows this editor through its controller, transport, business operation, and
cache update, with the tests that cover each boundary.

## Compare judgments and their bases

The application overview brings the manager's recommendation and reviewer
judgments together, with comparable authors, roles, proposed amounts, and
reasoning. Compact summaries identify earlier material; details retain the full
recording provenance and access to corrections and follow-ups. Keep unknown
dates or versions explicit.

Keep a compact budget summary alongside application work: the proposed total,
remaining amount if approved, or amount above budget. Use **Proposed allocation**
and **Save recommendation** to make the action's scope clear. Place a brief note
beside the allocation when a deferral reserves nothing or a conditional
recommendation counts in full.

Optional budget help explains the current draft's effect alongside other saved
recommendations and that saving does not commit funding. Link to
`/docs/recommendations#budget` in a clearly labelled new tab so consulting help
preserves the draft and reading context.

## Keep reference material available

During editing, preserve access to submitted material, assessments, version
history, and application details. A successful save restores the overview while
leaving the chosen reference material in place. Closing or discarding also keeps
that context. Follow the shared
[editing pattern](../../../../../../foundation/ui/src/patterns/editing/editing.mdx)
for controls, draft lifetime, and recovery.

Use the [editor stories](../../../../../grantmaking/web/src/views/recommendations/recommendation-editor.stories.tsx) for focused states and
the [application-view stories](../../../../../grantmaking/web/src/views/applications/application-view.stories.tsx) for
cross-pane reading and editing. Follow
[UI verification](../../../../../../docs/guides/ui-verification.md) when checking
focus, scrolling, draft recovery, and narrow-screen navigation.
