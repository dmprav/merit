# Compose recommendations and budget help

Use this guide when changing the recommendation overview or editor. The
[recommendation workflow](../../../../../../docs/workflows/recommend-funding.md)
owns funding positions, budget calculations, provenance, and save guarantees.
The [save walkthrough](../../../../../../docs/guides/recommendation-walkthrough.md)
follows this editor through its controller, transport, business operation, and
cache update, with the tests that cover each boundary.

## Connect the summary and editor

Use the [recommendation examples](../../../../../grantmaking/web/src/views/recommendations/recommendation-editor.mdx)
when changing how the application presents a judgment, its submission basis, or
the effect of the draft on the round budget. The application view composes the
summary and editor with the selected reference material. Saving, closing, and
discarding return to the overview with that material still available.

Use the recorded basis to resolve **Compare changes**. Unknown dates and versions
must remain explicit. Keep amount errors beside the field and distinguish a
missing allocation from excess precision. The optional budget help links to
`/docs/recommendations#budget` in a labelled new tab so consulting it preserves
the draft and reading context.

The [editor stories](../../../../../grantmaking/web/src/views/recommendations/recommendation-editor.stories.tsx)
exercise form states. The [application-view stories](../../../../../grantmaking/web/src/views/applications/application-view.stories.tsx)
compose the full reading and editing surface.
