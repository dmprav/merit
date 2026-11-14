# Provision an organization

A Merit operator creates an empty workspace and invites its first owner.
The owner explicitly joins with a real account. Organization creation is
operator-controlled; operators do not automatically receive workspace membership
or access to grant data.

## Move between administration and workspaces

Navigation identifies the current workspace or **Administration** and offers
destinations the person can access. Administration uses the same operator policy
as its operations; it grants no membership or access to workspace data.

When a destination is inaccessible, explain what could not be opened and provide
a route to accessible work or the public home. A failed record within an accessible
workspace or administration area retains that area's navigation, so the person can
continue working.

## Find work needing attention

The organizations list shows each workspace's initial owner status and
invitation recipient. Email sending failures and unconfirmed sending remain
visible separately from acceptance, with sending problems leading the row's status.
Pending invitations show their expiry. The selected sort order survives navigation
within administration.

Organization details identify the current owner from the membership record;
missing details remain explicit rather than inferred from an old invitation.
Before an owner joins, show invitation status and the actions needed to continue
onboarding. Opening the workspace requires an eligible membership even for an
operator. Failed edits retain their input for correction or retry. Closing a form
preserves its draft; discarding it leaves other unfinished changes intact. A quick
name edit has explicit Save and Cancel actions.

## Create the workspace

The operator opens `/admin/organizations` and chooses **Create organization** to
open a dialog over the list. They enter its name, workspace address, and owner
email. Make clear that creation sends an invitation. Addresses must be unique and
stay fixed after creation; names remain editable. **Close** preserves unfinished
creation and invitation forms;
**Discard changes** removes their local draft. Visible **Resume organization** and
**Resume invitation** actions return to that work. Drafts survive navigation and
reload and browser restarts in the same operator account and browser profile, and clear when the account
changes. Creation records the organization and invitation together.
Retrying the same submission does not create another workspace or invitation.

Closing the dialog returns focus to its creation or resume action and retains the
list's sort order. While creation is pending, keep the dialog open and prevent
another submission. After creation, open the organization's details page.

The details page distinguishes three outcomes: the organization exists, the email
sender accepted the invitation email, and the owner joined. Email acceptance
by the sender does not establish inbox delivery. If sending fails or its outcome
cannot be recorded, the organization remains available and the operator can resend.

Successful changes receive action-specific feedback. If an invitation change is
saved but its status cannot be refreshed, the existing details stay visible with
a recovery action. Further invitation changes wait until that status is refreshed.

## Join as owner

The recipient opens the invitation, signs in or creates an account through Clerk,
and reviews the organization and responsibility before choosing **Accept invitation**.
Their account must have the invited email verified. An existing Merit user keeps
their identity and other memberships; accepting adds access to this organization.
Disabled users cannot regain access by accepting an invitation.

The first recipient becomes the organization’s owner and receives explicit
program-manager access. The invitation describes both responsibilities; ownership
and grant-work access are independent. There are no configurable permissions during
provisioning. Existing program-manager memberships retain their access. Organization
administrators cannot use the operator administration app unless separately
designated as Merit operators.

Acceptance commits membership and invitation acceptance together. Repeated
acceptance is safe, but does not restore removed access. The new owner
opens the empty workspace. `/app` opens a single eligible workspace directly or
shows a chooser for multiple memberships. Members can switch between their
workspaces while retaining a clear view of where they are working. The
[workspace navigation tests](../../interfaces/product/src/app/app-shell.test.tsx)
cover the shell's navigation behavior.

## Recover unfinished onboarding

Invitations expire after seven days. Resending issues a new link and invalidates
the previous link. Resend to the recorded recipient when sending needs recovery
or the link has expired. Before acceptance, the operator may replace the recipient or
revoke the invitation. Changing the recipient asks for confirmation with the
previous and new email addresses; revocation explains its effect before commitment.
Revocation leaves the organization visible as needing an owner. Concurrent acceptance and replacement cannot both succeed.

Owner invitations share the [team invitation sending limits](manage-team.md#invite-and-join).
Resending to the same recipient requires a one-minute wait, including after a failed
send. Reaching a limit preserves the existing invitation and any entered replacement
address; retry when the limit resets.

After acceptance, the first invitation cannot be replaced or revoked. Further
membership management takes place in [Team](manage-team.md). Creating grant data,
organization deletion, and public self-service organization creation are also
outside this capability.

[Local testing and production setup](../guides/organizations.md)
