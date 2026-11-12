# Manage an organization’s team

Team manages organization membership, administrative responsibility, and
organization-wide grant access. Program managers have access to the organization's
grant work; individual review assignments belong to the
[reviewer workflow](participate-in-review.md). External reviewers are invited to
assignments without being added to Team.

The [Contacts workflow](manage-contacts.md) manages people involved in
applications and reviews. Naming a contact does not create membership or grant
access; Team retains those responsibilities.

## Understand responsibilities

Membership has two independent attributes: organization responsibility and grant-work
role. The owner controls administrator appointments; administrators manage ordinary
membership and invitations. Program managers can read and edit current grant work.
Ownership and administration do not themselves grant access to grant information.
An administrator can explicitly grant program-manager access to anyone, including
themselves. This is trusted access administration, not a confidentiality boundary
against administrators granting themselves access.

Every organization has one owner after initial onboarding. The first recipient
explicitly accepts both ownership and program-manager access. The owner cannot be
removed or demoted through Team. Ownership transfer and self-service departure or
self-demotion are not available; contact the Merit operator for ownership changes
or recovery. Administrators cannot remove fellow administrators or change their
administrative responsibility; the owner can.

All members can see names, emails, and responsibilities in **Workspace settings → Members & access**. Administrators
also manage invitations, with expired invitations and sending problems visible as
work needing attention. After inviting someone, make the result easy to check.
The [team examples](../../interfaces/product/src/features/team/team-view.stories.tsx)
show how members and invitations are presented. Members with grant access start on
funding rounds; others start on Members & access. The workspace switcher respects the same
permissions. Names and contact emails are recorded during invitation acceptance;
show missing details as unknown.

## Invite and join

**Invite member** asks for an email and defaults to program-manager access. The
owner can additionally grant administration, with or without grant access. Both
the email and acceptance screen state the responsibilities. An account must verify
the invited email and explicitly accept before membership is created. Inviting an
existing member does not change their access; use **Edit access** instead.

One outstanding invitation is allowed per email and organization. Invitations
expire after seven days. **Resend** creates a new link and invalidates the previous
one, without affecting other invitations. **Revoke** asks for confirmation. Sending
failure, unconfirmed sending, expiry, and acceptance are distinct; sender acceptance
does not prove inbox delivery. Retry a failed email through Resend.

To protect recipients and shared email delivery, wait one minute between invitations
to the same email within an organization. Each organization can issue at most 20
invitations in a rolling hour and 100 in a rolling 24 hours, including owner invitations.
Failed sends and revoked invitations still count. A rejected send leaves the existing
link valid and preserves the form; wait for the stated limit to reset before retrying.
Concurrent requests share these limits across servers.

Invitation and access forms follow the shared
[editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx). **Resume invitation** and
**Resume access changes** reopen unfinished work. Repeating the same invitation
submission cannot create another invitation. Resumed access edits
retain the original membership version and reviewed invitation list; changed access
or consequences require discarding the draft and reviewing current details.

## Change access and remove members

**Edit access** changes administrative responsibility and grant access separately.
The interface offers only permitted actions; server operations recheck current
membership and authority. Concurrent changes reject stale submissions and ask the
administrator to review current details before trying again. Successful changes
refresh the directory; a failed refresh preserves the confirmed outcome and offers
a way to recover.

**Remove from organization** explains access loss, preserved work and authorship,
and the fresh invitation required to return. Removing membership or administrative
responsibility also revokes outstanding invitations the person issued. Show those
invitations before confirmation; a changed list requires a fresh review before
removal or demotion can commit. No action deletes the person’s account or their
memberships in other organizations.

Access ends on subsequent requests, including protected MCP reads. A reviewer
assignment accepted under the removed membership also loses access. Rejoining does
not restore it: a manager must end and explicitly reinstate the assignment. Historical
recommendations and their author records remain. Funding rounds identify their
responsible manager and show a need for reassignment when that person loses grant
access. Another current program manager can take responsibility from the round.
Merit does not yet provide a complete list of a departing member's outstanding
grant work, so removal asks the administrator to check handover needs with the team.

Each capability that assigns work is responsible for identifying affected work
and supporting reassignment. Access revocation may proceed before handover
finishes; unresolved handover must remain visible to the people responsible.

Membership changes, invitation acceptance/revocation, and their audit events commit
together. Web and MCP grant operations enforce the same access policies. See the
[available capabilities](../../README.md#available-today) for interface coverage.

[Local setup and verification](../guides/organizations.md)
