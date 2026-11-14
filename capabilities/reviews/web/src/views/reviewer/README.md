# Inspect reviewer participation

The [reviewer stories](reviewer-screen.stories.tsx) show accepting an assignment,
writing, submission, amendment, and recovery. The
[manager stories](manager-reviewers.stories.tsx) show invitations, delivery states,
conflict resolution, and ending access. Both use the real controls and controllers
with isolated, in-memory transports. Ordinary examples remain interactive. Pending,
failure, and conflict examples open on that result. Screen tests own the commands
that reach those results.

Business rules belong to the [reviewer workflow](../../../../../../docs/workflows/participate-in-review.md).
This page explains presentation choices and where to verify them.

## Layout and actions

The assignment uses the shared
[reference workspace](../../../../../../foundation/ui/src/patterns/reference-workspace/reference-workspace.mdx),
the same frame as the manager's application overview and recommendation editor.
On desktop the compact header stays in place while the application material and
the assessment scroll independently, so reading never moves the fields or the
**Submit** action. The reference switcher chooses between the pinned application
material and the assessment criteria; each keeps its reading position, and each
shows the assigned version and any change warning. Narrow screens stack the panes
with links between them and keep the save status and **Submit** at the bottom of
the viewport.

The header carries the facts a reviewer needs while writing: applicant, requested
amount, response date, and the requesting manager with an email link. Occasional,
consequential actions—reporting a possible conflict and withdrawing—sit in its
**More actions** menu. An invitation has no reference material yet, so its work
pane uses the full width and offers **Accept review**, **Decline review**, and
conflict reporting together beneath the invitation and assessment expectations.

## Managing reviewers

Each assignment's badge names what the manager needs to know first, combining
status, invitation expiry, and email delivery: an expired invitation and a failed
send replace **Awaiting acceptance**, as they do in the workspace
[invitation directory](../../../../../organizations/web/src/views/invitation-directory.tsx),
with the same delivery wording. When the invitation cannot reach the reviewer,
**Resend invitation** becomes the card's primary action. Response dates are
labelled and localized; history lists the newest event first with UTC times, as
review request details do.

Inviting, clearing a conflict, and ending access use the shared confirmation
dialog and name the reviewer. Clearing a conflict shows the reported conflict
beside the explanation field, states that the reviewer must accept again, and
reports a missing explanation beside the field rather than disabling the action.

## Writing and amending

The assessment reads in the order the manager will read it: funding position and
proposed amount on one row, overall reasoning, then optional notes, each shown with
its criterion's description. **Submit** first checks the draft against the
[reviews domain](../../../../business/src/domain/reviewer.ts) rule that the server
also applies. Each problem then appears beside its field, focus moves to the first
one, and a short summary sits beside **Submit**. The amount field rejects excess
precision as people type, as the recommendation editor does.

Submitted work shows the judgment, its date, and earlier versions with their
amendment notes. A pencil action in the pane header opens an amendment. Its footer
follows the [editing pattern](../../../../../../foundation/ui/src/patterns/editing/editing.mdx):
**Close** keeps the autosaved amendment and the header then offers **Resume
amendment** with a draft marker, while **Discard amendment** returns the draft to
the submitted assessment. Returning to the page opens the reading view first.
Submission is confirmed with the shared status message.

When two devices saved different drafts, both versions appear in full, labelled,
side by side where the pane allows, with the choice between them beneath.

## Verify changes

The [reviewer browser checks](../../../../../../tooling/storybook/tests/browser/reviewer.spec.ts)
exercise layout, keyboard and touch interaction, accessibility, and recovery. The
[persisted application journey](../../../../../../app/tests/browser/reviewer.spec.ts)
covers acceptance, draft recovery, submission, amendment, and access revocation.

Run the owning checks from the repository root:

```sh
vp run test:stories reviewer-screen.stories.tsx manager-reviewers.stories.tsx
vp run @merit/reviews-web#test --project ui
vp run test:browser:stories:all reviewer.spec.ts --workers 2
vp run @merit/app#test:workspace:all --grep 'an invited reviewer'
```

Choose checks for the behavior changed using the
[verification guide](../../../../../../docs/guides/verification.md).
