# Grantmaking workflows

Merit currently supports a program manager's work from round preparation through
funding recommendations. Managers record applications and assessments received
elsewhere; applicants and external correspondents need no Merit account. These
manager workflows are available through web and authenticated MCP. Invited reviewers
can use a separate browser workspace or authenticated MCP to submit their own assessments. The browser demo runs them in
an isolated workspace with fictional starting data.

| Task                                                     | Behavior and rules                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Prepare a round](prepare-round.md)                      | Purpose, budget, criteria, responsibility, and finding applications.                |
| [Record and revise applications](record-applications.md) | Partial intake, readiness, corrections, shared revisions, and material history.     |
| [Request and record reviews](review-applications.md)     | Review requests, received judgments, attribution, and changed evidence or criteria. |
| [Participate in a review](participate-in-review.md)      | Invitation, private drafts, independent submission, amendment, and access recovery. |
| [Recommend funding](recommend-funding.md)                | Manager judgments, proposed allocations, budget effects, and save conflicts.        |

## Find and return to work

Funding rounds and Applications provide independent workspace overviews. My reviews
lists the signed-in person's review assignments across organizations. Several rounds
may be active at once; navigation does not establish a single current round.

People can save personal shortcuts to rounds, applications, and their own review
assignments. Pins belong to the account and persist across devices. Round and
application pins are ordered separately within each workspace; assignment pins are
ordered under My reviews. Pinning or moving a shortcut changes no grant record,
assignment, or permission. Repeating a save or ordering request preserves its result.

Every read resolves current titles through the target's access rules. Losing access
hides the shortcut; deleting its target removes the saved pin. Application titles
come from recorded material, while review assignment titles describe the assigned
material. Contacts remain a secondary directory; membership is available through
Workspace settings → Members & access. The [workspace guide](../../interfaces/site/src/features/docs/workspace-guide.tsx)
explains navigation and pin controls.

## Catch up on shared changes

Activity, after Applications in the workspace navigation, lists who changed shared
grant work, newest first, so a program manager can catch up without visiting every
record. Only current program managers can read it, through web and through MCP with
the grant read scope. Other members are sent to Members & access.

Each entry shows when (UTC, as in other histories), who (the name recorded at the
time, or "Unknown person", with the web or MCP-client provenance), what changed,
and the record's current title with a link to its default page. A record that has
since been deleted reads "No longer available" and has no link. Actions this page
does not recognize read "Changed".

| Recorded                                                            | Not recorded here                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Application created, marked ready, revised, corrected, or deleted   | Application content and detail saves, and working revisions                         |
| Round created, deleted, or its budget, criteria, or manager changed | Round detail edits                                                                  |
| Assessment recorded by a manager, or submitted by a reviewer        | Review requests, reviewer drafts, invitations and responses, contacts, team changes |
| Recommendation saved                                                |                                                                                     |

Unrecorded changes remain in the application's or round's own history. An entry is
written in the same transaction as the change it describes, so a rejected or
conflicting write leaves none and a failure to record it leaves the change unsaved.

Activity shows 50 entries at a time; **Show older activity** loads the next page
(MCP: follow `nextCursor`). The **Round** filter matches the round, its
applications, and their assessments and recommendations; **Person** matches the
recorded person. The filters belong to the page and reset when it is left. Unlike
Applications' round filter they never appear in the address, so a person's
identifier stays out of URLs, browser history, and logs. Changing a filter starts
again from the newest entry. A deleted record belongs to no round, so the Round
filter omits its entries.

## Access and shared guarantees

All current workspace program managers can perform this work. Responsibility for
a round coordinates work without restricting other managers' access. Reviewers
and applicant contacts are [workspace contacts](manage-contacts.md); naming one
creates neither an account nor permission. [Team](manage-team.md) owns membership
and grant access.

Every write rechecks current authority and the relevant record revisions, then
commits history with the change. Web and MCP share these rules; requested grant
edits save directly without an additional browser approval step. MCP also enforces
the client's granted scopes. Provenance records the actor, interface, and verified
MCP client where present, without claiming that a human reviewed the action.

The [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx) owns shared control and
local draft behavior. Individual workflows explain their saved records, business
prerequisites, and conflict recovery. The
[business model](../../capabilities/grantmaking/business/README.md) explains record
ownership and cross-capability coordination.

## Beyond recommendations

Applicant-facing submission, attachments, live AI processing, reviewer discussions,
committee briefs, publication, and funding decision recording are not implemented.
[Future committee design](committee-decisions.md) preserves the agreed direction
separately from current behavior. GitHub issues and milestones track delivery.

[All workflows](README.md)
