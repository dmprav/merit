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
