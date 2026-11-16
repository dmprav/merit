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
Keep contact creation available inside the picker. Requests commit from the picker;
only recorded assessments and corrections have resumable drafts.

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

The overview uses compact identity, outcome, amount and basis rows. Selecting a
row reveals its assessment in the left reference pane. Outcome and amount share a
baseline; an earlier submission or changed criteria qualifies that outcome on its
own line before the reasoning. **Compare changes** opens the actual earlier
submission. **Review details** exposes exact versions, criterion notes, recording
provenance and change notes. **View criteria used** replaces the assessment with
the exact historical rubric and current criteria when their content differs.
Back names the view being returned to: **Back to assessment** or **Back to assessment
history** restores the originating control and reading position.
Unknown bases remain explicit; **Earlier assessments and edits** retains each
original basis. **Back to assessments** restores the originating action and reading
position. Request history follows the same in-pane navigation and groups each
request's status, basis, dated events, actors, and interfaces.

`ReviewWork` owns one review controller and supplies reading, action, task and feedback
slots to the application workspace. Recording, correction and **Manage reviews**
occupy the right task pane; left-side reference navigation leaves an active form
mounted. Reviewer assignments and commands share one controller above the reading
and management views; loading assignments disables request actions until their
participation is known. **Close** retains changed writing, **Resume editing** reopens it, and
**Discard draft** removes it. Recommendation editing disables review authoring
while leaving reading available. Standalone review work uses the same shared
reference workspace.

The review-owned [reading navigation](use-review-reading.ts) owns overview
selection and the nested inspection trail together. The application switches
reference panes and calls its open or show-all actions; it does not remount review
content to reset navigation. The shared reading-navigation hook restores focus and
the physical pane's reading position even when its owner lives above the pane.

Conflicting edits keep the right task pane and compare only the matching saved
assessment or request with the preserved draft. Application, criteria and review
revision changes identify their previous and current versions separately. Keep
comparison content neutral, explain the conflict in short inline feedback, and
put the explicit discard or keep-draft decisions in the footer. Keeping a draft
acknowledges the current revisions; it does not save. Ordinary save failures retain
the form and its entries. Successful writes use the shell confirmation placement.
Render the feedback slot outside switchable references so a saved-but-not-refreshed
warning and Retry remain available after the editor closes, regardless of which
material the person is reading. Retry refreshes the saved state without repeating
the write.
The review controller supplies [comparison facts](../../controllers/reviews/review-comparison.ts):
the matching recorded assessment, outstanding request, or missing record, plus
changed revision baselines. Views format these facts without selecting records or
reconstructing draft baselines.

Use the [manager-review stories](../../../../../../interfaces/product/src/features/grantmaking/views/reviews/review-work.stories.tsx)
for the connected flow and the [review tests](review-work.test.tsx) for focused
states. Follow [UI verification](../../../../../../docs/guides/ui-verification.md)
for keyboard, focus, and responsive checks.
