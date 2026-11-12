# Try Merit and request access

Visitors can explore Merit in a workspace with fictional data, without signing
up, then request an invited workspace for deeper access. This page defines the
current demo lifecycle, access requests, and entry into invited workspaces.

## Enter and explore the demo

The public website leads with **Try the demo**, with **Request an invitation**
for deeper access. Before creating a workspace, a short introduction explains the
visitor’s program-manager role, the fictional foundation, and the seven-day
lifetime. **Explore the example** opens the Workshop Saturdays guided journey;
**Browse the workspace** starts with funding rounds. Both choices explicitly
create the visitor’s workspace using the product's navigation, layouts, and
interactions. Active copies resume directly without repeating the introduction.
Make the visitor's program-manager role and fictional identity clear.

Make the demo identifiable and its guidance easy to find and reopen, including
the role and starting situation from the introduction. Keep exit
and reset actions discoverable, with confirmation before resetting progress.
Successful saves and resets receive unobtrusive confirmation while the visitor
continues working. Save failures remain actionable in the editor. Distinguish
prepared AI examples from live processing.

## Follow an optional guided task

Guided journeys introduce a task, the person's role, a fictional starting situation,
and a meaningful outcome. A visitor might examine reviewer disagreement, revisit
a recommendation after new evidence, or prepare a round for committee discussion.

Each journey has a stable link, a short introduction, and optional next steps.
It opens the relevant work within the application and uses the product's components
and business rules. The guide opens on entry to a guided scenario; ordinary demo
exploration starts with it closed. It offers a relevant next action without forced
steps or inferred completion. Dismissing it keeps it closed while navigating within
that scenario, and visitors can reopen it when needed. Suggested tasks open the
named example's reviews or its round budget directly, including from another
application, without restarting the demo or reopening the guide. If the visitor
has removed example records, retain a route to explore their workspace.
**Browse the workspace** provides an unguided starting point. The
[guide stories](../../interfaces/product/src/features/demo/demo-tools.stories.tsx)
show its task suggestions, workspace actions, and recovery states.

## Keep the visitor's progress

Each account or anonymous browser gets one isolated demo workspace. Guided journeys
and free exploration open the same workspace; public demo links never grant access
to another visitor's copy. Signed-in people act as themselves and can return from
another browser. Anonymous visitors use a temporary fictional identity. Signing in
opens the account's separate demo; anonymous progress is not transferred.

Demo work uses the application's ordinary operations, database records, permissions,
and draft recovery. Visitors can prepare rounds, add and revise applications, maintain
contacts, record reviews, and edit recommendations. Guidance describes the authored
starting situation and does not restrict or repair the visitor's changes. Prepared
history remains attributed to fictional authors or explicitly unknown sources;
visitor changes record the current user and interface.

A demo expires seven days after creation. Explain that lifetime when starting and
show its expiry in the guide. Expired copies are inaccessible even before cleanup.
Returning to a known expired copy offers **Start fresh**. When no copy remains,
choosing **Explore the example** or **Browse the workspace** explicitly creates a
new one; visiting or prefetching an entry link never creates data.

**Reset demo** requires confirmation and replaces the entire demo with the latest
example and a new seven-day lifetime. It leaves other workspaces and their drafts
alone. Old record addresses cannot write into the replacement. Improving the example
affects new and reset copies; ordinary application migrations preserve existing
copies until they expire. A demo cannot become a standard workspace.

## Experiment within clear limits

Demo visitors have ordinary program-manager access without team-administration
privileges. Invitations into demo workspaces are forbidden on the server. Existing
grant operations retain their normal validation and history; review requests do
not send notifications. Workspace type does not grant access.

Anonymous provisioning is limited by the request's network address, stored only as
a short-lived hashed bucket. At a limit, existing work remains accessible and the
visitor can retry later. External effects must remain subject to the owning
capability's policy when introduced.

## Request an invited workspace

**Request an invitation** opens an email form explaining that Merit is a portfolio
project, not a live grant-management service. Visitors can ask to explore an
invited workspace with sample data. A **Privacy notice** link opens `/privacy`
in a new tab, preserving the form and any entered email. The notice explains
what invitation requests store, their purpose, access, retention, and privacy
choices. Complete the project owner’s name and contact email before publishing it.

Submission saves a real request without creating an account, granting access, or
sending email. Only Merit operators can read requests in **Administration → Access
requests**. Addresses remain unverified until the ordinary invitation acceptance
flow verifies them. Operators can mark a request reviewed; that action sends no
message and grants no access. Repeated submissions retain the original request
and review status. Failures keep the entered email for retry.

Public submissions are limited to ten attempts per network address per hour using
short-lived hashed buckets. Expired buckets are removed on subsequent submissions.

Accepting an invitation grants membership in a specific organization. Newly provisioned
workspaces start empty; invitations to an existing organization give access
according to the offered responsibilities. Keep the organization and those
responsibilities clear before acceptance. The public demo remains available for
exploring prepared fictional grant work.

Accounts, invitations, and permissions follow the product's access rules;
organization access requires membership.

Sign-in stays within Merit, with authentication forms styled to the product and
an optional **Try the demo** link. Signing in opens the account’s workspace, or a workspace chooser for multiple
memberships. [Organization provisioning](provision-organizations.md) describes
how operators create workspaces and invite their first owners.
If no workspace is available, explain that sign-in succeeded and ask the person
to contact whoever invited them to arrange access. Offer the demo as a way to
continue exploring without sending them back to the same unavailable workspace.

## Connect through MCP

The browser demo is the public starting point. MCP requires an authenticated
account connection; there is no anonymous example tool. The
[MCP guide](../guides/mcp.md) explains discovery, client grants, tools, and recovery.

Web and MCP operate on the same workspace data under the same permissions and
business rules. Clients can carry out requested grant edits, including budget
changes, without browser confirmation. Team administration requires a separate
client grant. History identifies the person and interface, including the verified
client for MCP actions. Signed-in users can work in their own demo through authenticated MCP under the
same memberships and scopes. Anonymous browser sessions do not authorize MCP.
