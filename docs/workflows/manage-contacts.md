# Manage workspace contacts

Program managers maintain shared contacts for applicant communication and reviews.
Contacts are available through workspace web and MCP interfaces, including in the
demo. Their identity stays separate from accounts, membership, and recorded judgments.

## Find and use a contact

**Contacts** is a secondary workspace destination for finding and maintaining contact details.
Managers can also select or add a contact while preparing an application or
[requesting or recording a review](review-applications.md).
The same contact can be used across applications and rounds in that workspace.

A contact has a name and optional email or affiliation. Existing applicant contacts
with only an email remain valid; a reviewer's name is required when attributing an
assessment. Names and email addresses do not establish that two records describe
the same person. Contacts with the same name remain distinguishable.

The field in a review workflow is **Reviewer**; the person selected is a workspace
contact. An application's contact is separate from the applicant seeking funding.
The applicant organization is not inferred from the contact's affiliation.

Current program managers can view and maintain contacts. Organization administration
alone does not grant access to grant contacts. **Workspace settings → Members & access** manages
membership and access; contact selection creates neither an account nor membership.
A [review invitation](participate-in-review.md) captures the contact’s email and
binds its assignment to the verified account that accepts it. This leaves the
contact’s identity and earlier manager-recorded assessments intact. Changing a
contact email does not transfer an existing assignment to another account.

## Edit details or change the person

In **Contacts**, **Edit contact details** changes the shared current profile. Make that shared effect
clear wherever the edit starts. Updated details appear wherever the contact is used;
historical application records and assessment attribution preserve what was recorded
at the time. Applications resolve the current profile through their contact link.
Contact edits do not add application history, advance its intake revision, change
the material being assessed, or make an assessment outdated.

**Change contact** associates an application with a different person. It does not
rename the existing contact or change who is associated with other applications.
Editing a contact cannot rewrite the reviewer or recorder of an earlier assessment.

Web and MCP use the same create, update, archive, and restore commands. Updating
a profile preserves its archive state; archiving or restoring preserves its
current details. Changes to existing contacts require the original contact revision.

Contact forms follow the shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx).
**Save contact** commits the shared profile; **Resume contact** and **Resume editing**
reopen unfinished work in the directory and pickers. A conflict requires reviewing
the current profile against the draft's original contact revision.

## Archive a contact

Archiving removes a contact from ordinary selection lists while preserving existing
application links and assessment history. Show outstanding review requests before
archiving and require managers to resolve them first. Archiving does not silently
cancel requested work. Managers can restore an archived contact.

## Preserve identity and history

Applicant contacts and reviewers use the same contact capability. Existing email-only
contacts and uncertain identities remain separate; matching names or email addresses
never automatically merges people. Contact merging is not implemented.

Keep recorded application details, reviewer attribution, and recording history.
Accounts, memberships, and invitations retain their identity and access meaning;
manager recommendations, staff summaries, and audit records retain their authorship.
Imported records must not infer account ownership or invent missing historical
identities. Contact data and links remain scoped to their workspace.
