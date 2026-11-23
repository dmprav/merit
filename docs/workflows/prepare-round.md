# Prepare a funding round

Program managers create and prepare rounds through web and MCP, including in the
demo. A round organizes received applications; preparation does not publish an
opportunity or open applicant-facing intake.

## Create a round

A program manager creates a round from the workspace's Funding rounds list. Only
its name is required; purpose, budget, and committee date are optional.
Creation saves these together, assigns responsibility to the creator, and records
who created it and when. An initial budget appears in budget history with any
reason supplied through MCP. Repeating the creation request returns the same
round and preserves the original budget entry.

Creation follows the shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx).
**Resume funding round** reopens unfinished input. Failed creation retains its
retry identity. If opening the saved record or refreshing the list fails, keep
a link to the saved record and offer recovery without creating it again.

## Edit preparation

Renaming a round or changing its committee date or responsible manager saves directly
as a field-level update (with Undo checking the saved revision before reverting).
Failed changes retain the input and explain the error.

Purpose, criteria, and budget editors keep surrounding work available and use the
shared draft recovery rules. Budget changes show their reason and history before
an explicit save.

Edits to unrelated round sections rebase transparently when saving. When a true
collision affects the same section (purpose, criteria list, or budget), an inline
banner keeps the editor open so the manager can view the latest saved values, keep their
changes over the latest version, or discard and load the latest round. Saving
unchanged values creates neither a new revision nor a history entry.

## Set the budget and criteria

New rounds have status **Preparing**. Purpose, criteria, committee date, and budget
may remain undecided. Completing these fields does not open intake or start reviews.
An unset budget is distinct from €0, and a missing committee date is “Not scheduled.”
Requested and proposed totals remain meaningful without a budget; remaining or
exceeded budget cannot be calculated until it is set. Rounds currently use EUR.

The first budget entry establishes the amount with an ordinary save. Subsequent
changes show the current and proposed amounts and require a reason. Saving confirms
the change and records the actor, timestamp, previous amount, new amount, and reason.
Keep that history available while considering another change. A round’s budget can return to
“Not set,” with a reason once an amount has been established. Setting a replacement
amount after clearing the budget also requires a reason. Applications can be
prepared and marked ready while the round budget is undecided. Amounts accept at most two decimal places;
invalid precision is rejected without changing the entered amount.

Each criterion retains its identity through wording changes and reordering. A new
or duplicated criterion has a new identity, including when its title matches an
existing criterion. Earlier criteria snapshots retain their original wording.

Assessment criteria pair a short title with optional guidance about what reviewers
should consider. Managers can add, edit, remove, and order them during preparation.
Criteria remain editable with preserved versions and visible effects on earlier
work; see
[responding to changes](review-applications.md#respond-to-application-and-criteria-changes).

## Assign responsibility or delete an empty round

The responsible manager coordinates the work; all current workspace program managers
retain editing access. Responsibility can move to another current program manager
without relabeling historical recommendations. If the responsible person loses grant
access, their name remains and the round shows that reassignment is needed. A round
without an identified responsible member needs assignment.

A program manager can delete a round with no applications after confirming its name
and the loss of preparation details. The server checks the current revision and
that the round is still empty. Change history survives deletion. Rounds containing
applications cannot be deleted through this workflow.

Once deletion commits, a toast confirms it and the browser returns to the rounds
list without an intermediate screen. If that navigation fails, the page's ordinary
error handling takes over; deletion is never repeated.

## Find and compare applications

The rounds list helps people find their work. Within a round, Overview explains its
purpose and assessment criteria; Applications supports checking details and comparing
review progress and manager recommendations. Keep requested and proposed totals
available while comparing applications, including the remaining amount if approved.
Outdated assessments and awaiting reviews remain distinct; unknown requests and an
unset budget remain explicit.
Search matches application and applicant names. Filters narrow the list by readiness
or participation, or to awaiting reviews, no assigned reviewers, changed evidence or
criteria, unknown review basis, or missing recommendations. These reflect recorded facts rather than a separate
priority score. Requested and proposed amounts have separate sortable columns; unknown
amounts stay last in either direction. The summary always describes the whole round,
including while the list is filtered.

Searching, filtering, and sorting change neither source application order nor round
totals. Returning from application details or assessments preserves the Applications
tab, search, filter, sorting, and list position for the account session so people can
resume reading or comparing.
[Round screen examples](../../capabilities/grantmaking/web/src/views/rounds/funding-round-view.stories.tsx)
show populated and incomplete rounds.

Next: [record applications](record-applications.md). See the
[grantmaking overview](review-and-decide.md) for access and shared guarantees.
