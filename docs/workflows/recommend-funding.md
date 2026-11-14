# Recommend funding

Program managers propose an application's treatment and allocation through web and
MCP, including in the demo. Saving a recommendation does not commit funding;
[committee decisions](committee-decisions.md) are not implemented.

Managers can compare their recommendation with reviewer judgments, including
authors, roles, proposed amounts, and reasoning. Assessment details retain
provenance and basis, with access to corrections and follow-ups.

Each assessment and recommendation retains its recorded date and source application
version when known. Earlier material remains identifiable and full recording
provenance stays available. A save records and preserves that provenance;
unknown dates or versions remain explicitly unknown.

## Interpret the recommendation and budget

Reviewers provide independent judgments; the manager draws on those
judgments to propose the application’s treatment in the round. The recommendation
may be unwritten while reviews are underway. Its absence is distinct from a
deferral or a recorded zero allocation and reserves no funding. Reviewer and manager
outcomes use the same format for recommendation position and proposed amount.
Review progress and version freshness are separate from the funding position;
only manager recommendations count toward the round’s proposed allocations.
A funding recommendation requires [ready application material](record-applications.md#save-preparation-and-mark-it-ready);
an explained deferral is possible during preparation.

The budget summary shows the proposed total and what would remain if approved,
or how far proposals exceed the budget. These amounts describe recommendations,
not funding commitments, and proposals may exceed the budget. Conditional
recommendations count in full; deferrals reserve nothing. While editing, the
preview uses the current draft alongside other saved manager recommendations.
The effect of saving must be clear before commitment.

A [withdrawn application](record-applications.md#withdraw-or-reinstate-an-application)
stays readable with its recommendation, but the recommendation can no longer be
changed. Its allocation leaves the round's proposed allocations and remaining
budget, and the totals used to validate or preview another application's
recommendation. The budget summary and the editor's preview name how many withdrawn
applications they do not count. Reinstating the application counts its retained
recommendation again.

## Save and recover

While writing a recommendation, the manager can consult submitted material,
assessments, version history, and application details without losing the draft
or their place in the reference material.

Editors follow the shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx).
Saving, closing, or discarding preserves the chosen reference material and reading
context.

Recommended amounts in EUR accept at most two decimal places. Preserve the amount
the manager intends: reject excess precision with corrective feedback, without silent
rounding or truncation. See the [money decision](../decisions/0008-money.md).

Saved recommendations persist on the server. The
[demo's progress rules](public-demo-and-access.md#keep-the-visitors-progress)
define the lifetime and reset behavior of its isolated workspace.

A workspace save checks current manager access and the recommendation revision and
application version on which the draft was started. A conflicting save keeps the
draft open and loads the latest reference data. Discard changes removes that draft so the
manager can review the current recommendation and start again. A save that changes
the recommendation's content, author, or application basis records the actor,
timestamp, and before/after recommendation together, along with a compact workspace
audit event referencing the saved recommendation revision. A save that changes none
of these keeps the current revision and records nothing. Its actor name and web or MCP provenance are captured
at the time of the save. Both records commit together; a history or audit failure
leaves the recommendation unchanged. Managers read these events in
[Activity](review-and-decide.md#catch-up-on-shared-changes).

The [recommendation presentation guide](../../capabilities/recommendations/web/src/views/recommendations/README.md)
owns summary composition, editor labels, contextual help, and the screen examples.

[All grantmaking workflows](review-and-decide.md)
