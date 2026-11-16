# Compose review work

Use this guide when changing request controls, assessment forms, and supporting
history. The [review workflow](../../../../../../docs/workflows/review-applications.md)
owns request completion, judgment attribution, review bases, and version changes.

## Compare review work in collections

`ReviewSummary` presents completed reviews out of assigned reviews as a neutral
progress label in workspace and round application tables. Completion includes
current, outdated and unknown-basis reviews; it does not imply freshness or
success. No assignments reads **None assigned**. When available, the label links
directly to review work using a native link.

One adjacent status hint qualifies outdated or unknown review bases and changed
criteria. It exposes the full count breakdown and each applicable reason on
hover, keyboard focus or press. Ordinary progress needs no hint. Screen-reader
text always retains the freshness counts. Use the domain's `summarizeAssessments`
when starting from assessments.
The [workspace examples](../../../../../../capabilities/grantmaking/web/src/views/rounds/applications-overview.stories.tsx)
include long titles, unknown review bases and withdrawn applications.

## Request a review

**Add review request** opens the searchable [request picker](request-picker.tsx).
Explain there that choosing a reviewer records the request immediately and sends
no message. Prevent selecting current outstanding reviewers for a new request. Replacement
uses the same picker; a follow-up request for a known reviewer acts directly.
Keep contact creation available inside the picker and retain existing resumable
request drafts.

A failed save keeps the choice available for retry. If the work changed, require
reopening against current state. Keep this outcome distinct from a saved request
whose surrounding view could not refresh.

The [review controller](../../controllers/reviews/use-review.ts) starts a request
session when the picker opens. The returned action retains that session's review,
application, and criteria baseline through retries; reopening captures current
state. The [request controller](../../controllers/reviews/use-review-request.ts)
coordinates the picker with that action. Views supply the selected person and
present outcomes without assembling revision numbers. Keep these responsibilities
together when changing request entry or recovery.

## Record received judgments

The [assessment form](review-form.tsx) marks required fields consistently and leaves
optional fields unmarked. An empty amount reads **Not stated**; show its currency
prefix when an amount is entered. Keep contact creation and editing inside the
reviewer selector.

**Add criterion notes** opens optional writing fields for the selected criteria.
Show existing notes when editing or reopening a draft, including retained notes
for criteria outside the selected basis. Keep the distinction between the
reviewer's judgment and the manager recording it visible.

The [observation helpers](../../controllers/reviews/observations.ts) own these draft
transitions. Changing the basis orders fields by the selected criteria and retains
written notes about other criteria. Opening optional notes adds missing fields
without rearranging existing writing. Keep these rules outside form callbacks so
retention and ordering can be verified independently of the controls.

## Preserve reading context

Request history groups the reviewer, status, material and criteria versions,
dated events, actors, and interfaces. Open [request details](request-details.tsx)
and review details separately from assessment text so inspecting provenance does
not displace surrounding judgments. Keep submitted material available and preserve
the route back to the round's review work.

Use the [manager-review stories](../../../../../../interfaces/product/src/features/grantmaking/views/reviews/review-work.stories.tsx)
for the connected flow and the [review tests](review-work.test.tsx) for focused
states. Follow [UI verification](../../../../../../docs/guides/ui-verification.md)
for keyboard, focus, and responsive checks.
