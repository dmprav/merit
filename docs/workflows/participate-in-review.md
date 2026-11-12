# Participate in a review

A program manager can invite a person to assess one application in a standard
workspace. The reviewer signs in, accepts the assignment, writes a private draft,
and submits their own judgment. This workflow is available through the browser and authenticated MCP. It tests the prototype's
hypothesis that an occasional external reviewer can complete the work independently;
it is not evidence of validated demand. Manager-recorded external assessments
remain available through [web and MCP](review-applications.md).

## Invite and accept

Create a review request with a workspace contact, then choose **Invite reviewer**.
A contact email and the requesting manager's verified email are required. An
optional response date is advisory; passing it never blocks saving or submission.
Any current program manager can manage assignments. The requesting manager stays
named as the contact for questions, which continue by email outside Merit.

The invitation shows the applicant, application title, instructions, contact, and
due date. Sign in with an account that verifies the invited email. Before accepting,
the recipient can decline or report a possible conflict without opening the full
application. Acceptance binds the assignment to that account. No workspace
membership is created, and external reviewers receive no access to workspace membership settings, Contacts,
other applications, manager recommendations, or other reviewers' assessments.
Existing staff retain their separate staff rights; private drafts remain private.

Invitations expire after seven days. Resending extends the invitation for the same
person and assignment. The assignment URL is not a bearer credential: the server
checks verified identity and current access on every operation. Reviewer invitations
have a one-minute per-recipient cooldown within the organization and limits of 20
per hour and 100 per day. Sending failure does not erase the assignment; its status
is visible to managers. Sender acceptance does not prove delivery to the inbox.

## Read, draft, and submit

The application material and criteria are pinned to the request's original versions.
Changed application versions and different criteria content are flagged using the
shared [review freshness policy](review-applications.md#review-basis-and-freshness-policy),
without replacing the assigned evidence. A later criteria version with matching
content does not raise a content-change warning. The manager decides whether to
request a follow-up. A reviewer sees their own work in **My reviews**
and can return directly through the invitation link or a personal shortcut beneath
My reviews. [Navigation pins](review-and-decide.md#find-and-return-to-work) follow
the assignment’s existing access rules. A reviewer who also belongs to workspaces
switches to them from My reviews, and reaches My reviews from any of those
workspaces; operators keep Administration in both.

Drafts autosave on the server and can be resumed on another device. Save status
shows when writing has not reached the server. Managers cannot read draft content.
If two devices edit the same revision, preserve both versions and require the
reviewer to choose which text to continue with. Unconfirmed saves retain the same
command identity when retried; navigation warns about unsaved changes.

Submission requires an overall funding position and reasoning. **Fund** and
**Fund with conditions** also require a positive proposed amount; explain any
conditions in the reasoning. **Defer** and **Decline** need no allocation.
Criterion notes are optional. Submission saves the authenticated author, original
basis, and content atomically, completes the request, and notifies the manager.
Delivery failure leaves the assessment saved and offers a notification retry.

Managers cannot edit authenticated reviewer submissions or fulfil their assignment
on the reviewer's behalf. The author can submit an amendment with an explanation;
earlier submitted versions and attribution remain available. Completed work and its
evidence remain readable until access is explicitly ended.

## Handle conflicts and access changes

A reviewer may withdraw before submission. A possible conflict can be reported
before acceptance, while drafting, or after submission. Reporting pauses access and
flags the assignment; any submitted assessment remains recorded. A manager must
explain why the conflict is cleared, and the reviewer must explicitly accept again.

**End access** immediately prevents subsequent reads of evidence, saves, and
submissions. It preserves the private draft and submitted history. **Reinstate
assignment** restores the same person and basis, including the saved draft; an
unresolved conflict stays paused. A withdrawn assignment stays declined; create a
new request if the person later agrees to review. An archived contact must be restored
before their assignment can resume.

Disabled accounts cannot access assignments. If a reviewer accepted as a workspace
member, removing that membership ends their assignment access too. Rejoining does
not restore it implicitly; a manager must explicitly end and reinstate the assignment.
Revocation and submission serialize so a write cannot commit under revoked authority.
Private drafts remain with the application, with no time-based deletion policy.

Invitation, lifecycle, conflict-resolution, submission, and amendment events keep
actor and interface attribution. Only invitations and submissions/amendments send
email. Other status changes are visible in the application. Automatic reminders,
chat, shared discussion, and committee publication are outside
this implementation.

The [MCP guide](../guides/mcp.md#participate-in-and-manage-reviews) explains reviewer
and manager tools, dedicated scopes, and revision recovery.

[Grantmaking workflows](review-and-decide.md)
