# Contacts and team

Reference workflows: [Manage contacts](../../../../docs/workflows/manage-contacts.md) and
[Manage a team](../../../../docs/workflows/manage-team.md).

## Sub-features

- Shared workspace contacts directory for applicants and reviewers (create, filter, edit, actions)
- Inline contact creation from application details (`Applicant contact` picker)
- Workspace members and pending invitations directory (`Members & access`)
- Inviting members with explicit **Organization responsibility** (`Administrator` / member)
  and **Grant-work access** (`Program manager`, `Reviewer`, `No grant-work access`)
- Accepting workspace invitations via `/invitations/$token`
- Editing member access and removing members with handover guidance

## How to reach it (user POV)

- **Contacts:** open main navigation -> **Contacts** (`/app/$workspaceSlug/contacts`).
- **Team & access:** open main navigation -> **Workspace settings**
  (`/app/$workspaceSlug/settings` redirects to `/app/$workspaceSlug/settings/members`).
- **Accept an invitation:** open the invitation link delivered to Mailpit
  (`http://127.0.0.1:8025`) -> `/invitations/$token`.

## Driving handles / selectors

- **Contacts (`/app/$workspaceSlug/contacts`):**
  - Heading: `heading[name="Contacts"]`
  - Create: `button[name="Add contact"]` -> `dialog[name="Add contact"]` with
    `textbox[name="Name"]`, `textbox[name="Email"]`, `button[name="Save contact"]`
  - Filter: `button[name="Filter"]` -> `searchbox[name="Find a contact"]` (press `Escape` to
    close filter popover)
  - Row menu: `button[name="Actions for <Contact name>"]`
- **Members & access (`/app/$workspaceSlug/settings/members`):**
  - Page title: `Members & access · Merit`
  - Invite: `button[name="Invite member"]` -> `dialog[name="Invite member"]`:
    - `textbox[name="Email address"]`
    - `button[name=/Organization responsibility/]` -> e.g. `option[name=/^Administrator\b/]`
    - `button[name=/Grant-work access/]` -> e.g. `option[name=/^Reviewer\b/]` or
      `option[name=/^No grant-work access\b/]`
    - Submit: `button[name="Invite member"]`
  - Post-invite confirmation:
    `alertdialog[name="Invitation saved. Check its email delivery status below."]`
  - Member row actions: `row` matching email -> `button[name="Actions for <Member name>"]` ->
    `menuitem[name="Edit access"]` (`dialog[name="Edit access for <Member name>"]`)
- **Invitation acceptance (`/invitations/$token`):**
  - Action: `button[name="Accept invitation"]`

## Gotchas

- Inviting an `Administrator` does **not** implicitly grant grant-work access; grant-work access
  must be chosen explicitly (`No grant-work access` keeps the member scoped to
  `/settings/members`).
- To test invitation acceptance in `workspace` mode, switch persona via DevTools or cookie
  (`merit-local-person=recipient` for `recipient@example.test`, `manager` for
  `dana@example.test`) before visiting `/invitations/$token`.
- Mailpit must be running (`vp run services:start`) for invitation email delivery status and
  fetching `/invitations/$token` links locally.
