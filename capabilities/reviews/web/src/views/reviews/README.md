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

The review section's quiet **Add** menu offers **Request review** and **Record
assessment**. **Request review** opens the searchable [request picker](request-picker.tsx)
on the same trigger and returns focus there when it closes. Explain above the
choice that choosing a reviewer records the request immediately and sends no
message. Replacement
uses the same picker; a follow-up request for a known reviewer acts directly.
Keep contact creation available inside the picker. Requests commit from the picker;
only recorded assessments and corrections have resumable drafts.

The [review workflow](../../../../../../docs/workflows/review-applications.md#request-reviews)
owns retry and changed-work recovery. Keep a failed save distinct from a saved
request whose surrounding view could not refresh.

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
Back names the view being returned to—**Back to assessments**, **Back to assessment**,
or **Back to assessment history**—and restores the originating control and reading
position. Unknown bases remain explicit; **Earlier assessments and edits** retains each
original basis. Request history follows the same in-pane navigation and groups each
request's status, basis, dated events, actors, and interfaces.

`ReviewWork` owns one review controller and supplies reading, action, task and feedback
slots to the application workspace. Recording, correction and **Manage reviews**
occupy the right task pane; left-side reference navigation leaves an active form
mounted. Reviewer assignments and commands share one controller above the reading
and management views; loading assignments disables request actions until their
participation is known. Recommendation editing disables review authoring
while leaving reading available. Standalone review work uses the same shared
reference workspace.

The review-owned [reading navigation](use-review-reading.ts) owns overview
selection and the nested inspection trail together. The application switches
reference panes and calls its open or show-all actions; it does not remount review
content to reset navigation. The shared reading-navigation hook restores focus and
the physical pane's reading position even when its owner lives above the pane.

The [review controller](../../controllers/reviews/use-review.ts) decides which
review changes conflict with a draft, and supplies the current assessment values
and keep/load actions to the shared conflict banner. Keeping a draft reaffirms it
against the current versions without saving yet, while discarding loads the
latest server values. Render the feedback slot outside switchable references so a
saved-but-not-refreshed warning and Retry remain available after the editor
closes, regardless of which material the person is reading. Retry refreshes the
saved state without repeating the write.

Use the [manager-review stories](../../../../../../interfaces/product/src/features/grantmaking/views/reviews/review-work.stories.tsx)
for the connected flow and the [review tests](review-work.test.tsx) for focused
states. Follow [UI verification](../../../../../../docs/guides/ui-verification.md)
for keyboard, focus, and responsive checks.

## Show the AI review apart from assessments

The [AI review views](../ai-review/ai-review-overview.tsx) are their own section,
after **Review** in the application overview, and never part of the assessment list.
The latest run is a `JudgmentChoice` by **Merit AI**; choosing it opens the full
review in the reference pane beside the assessments, with Back returning to its
entry. The [AI review controller](../../controllers/ai-review/use-ai-review.ts)
owns the run: one pending run at a time, a run ID generated per submission and kept
only while a run's outcome is unconfirmed, a refused run replacing the action with
its availability explanation, and a saved review whose refresh failed retrying only
the refresh. The [AI review workflow](../../../../../../docs/workflows/review-applications.md)
owns availability, input, and citation rules; the section explains each unavailable
reason in visible text. The run button stays mounted through a run and a retry so
focus is kept. Connected states are in the
[AI review stories](../../../../../../interfaces/product/src/features/grantmaking/views/reviews/ai-review.stories.tsx).
