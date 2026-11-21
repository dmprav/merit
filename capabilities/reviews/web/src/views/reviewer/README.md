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

The application header groups the applicant and requested amount. The requesting
manager and response date belong to the assessment task beneath its heading.
Occasional, consequential actions—reporting a possible conflict and withdrawing—sit
in **More actions**. Before acceptance, a bounded invitation leads with the task
title, then the application identity, requester, response date, and response actions.
Application material remains unavailable until acceptance. Authorized submission
answers use the same reading component as the manager's intake view; each caller
retains its own material source and access checks.

## Managing reviewers

Each assignment groups person identity, participation, response date, and invitation
email state in aligned records. Delivery remains separate from acceptance: failed,
unconfirmed, or expired invitations do not imply waiting on the recipient.
Each reviewer's **More actions** menu contains resend, end access, and assignment
history commands. Conflict clearance and reinstatement stay visibly labeled.
Assignment history opens in place as an event list with UTC times; returning
restores the menu trigger's focus and the list's reading position.

Inviting and clearing a conflict use compact shared form dialogs; ending access
uses a confirmation. Conflict clearance keeps the reported explanation visible,
states that the reviewer must accept again, and focuses a missing explanation.
Membership guidance appears when invitation fails because the prerequisite is
missing. The optional response date never becomes a submission deadline.

The participation controller keeps command failures separate from refresh failures.
A confirmed invitation or access change closes its dialog and retains the known
assignment even if refreshing fails. Refresh retries the assignment and workspace
reads after a saved change; it never repeats that command.

## Writing and amending

The assessment reads in the order the manager will read it: funding position and
proposed amount on one row, overall reasoning, then optional notes, each shown with
its criterion's description. **Submit** first checks the draft against the
[reviews domain](../../../../business/src/domain/reviewer.ts) rule that the server
also applies. Each problem then appears beside its field, focus moves to the first
one. Privacy information stays beside **Submit**. The amount field rejects excess
precision as people type or paste, as the recommendation editor does; restored
invalid values remain visible and cannot be submitted.

Submitted work shows the judgment, its date, and earlier versions with their
amendment notes. An icon-only pencil in the pane header opens an amendment, with
an accessible **Amend assessment** label and tooltip on hover or keyboard focus. Its footer
follows the [editing pattern](../../../../../../foundation/ui/src/patterns/editing/editing.mdx):
**Close** keeps the autosaved amendment and the header then offers **Resume
amendment** through the same pencil's label and tooltip with a draft marker, while **Discard amendment** returns the draft to
the submitted assessment. Returning to the page opens the reading view first.
Submission is confirmed with a toast.

When two devices saved different drafts, the shared conflict banner offers
**View saved** for the other device's draft and explicit choices between the two
versions. Reporting a possible conflict uses a compact form dialog; closing it
preserves the explanation on the current page.

When access ends, one state heading and explanation replace the application and
editor. Any unsaved writing stays in a separate **Unsaved assessment** section.
**Copy draft** copies its field labels and exact values, including criterion notes
and the amendment explanation. A confirmation follows a successful clipboard
write; failure leaves the text visible with a retry or manual-copy explanation.
Conflict comparisons and retained drafts share a lossless field representation with
copying, including invalid amounts. Submitted judgments use their validated summary.

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
