# Admin and provisioning

Reference workflow: [Provision organizations](../../../../docs/workflows/provision-organizations.md)
and [Organization provisioning guide](../../../../docs/guides/organizations.md).

## Sub-features

- Operator organizations list (`/admin/organizations`) and organization detail
  (`/admin/organizations/$organizationId`)
- Creating new organizations with permanent URL slug validation, draft preservation across
  Escape/Close/reload, and initial owner invitation email
- Reviewing public invitation access requests (`/admin/access-requests`)
- Non-operator access boundary (clean denial screen without exposing admin navigation)
- Multi-workspace switching after accepting invitations to multiple organizations

## How to reach it (user POV)

- **Switch to Merit operator (`workspace` mode):** open **Open TanStack Devtools** -> **Merit**
  tab -> click **Merit operator**, or set cookie `merit-local-person=operator`.
- **Organizations console:** click **Organization administration** in DevTools or navigate to
  `/admin` (redirects to `/admin/organizations`) or `/admin/organizations`.
- **Access requests queue:** open `/admin/access-requests` from the admin navigation.

## Driving handles / selectors

- **Organizations list (`/admin/organizations`):**
  - Title: `Organizations · Merit administration`, heading: `heading[name="Organizations"]`
  - Create / resume dialog trigger: `button[name="Create organization"]` (changes to
    `button[name="Resume organization"]` when an unsaved local draft exists)
  - Dialog: `dialog[name="Create organization"]`:
    - `textbox[name="Organization name"]` (autofocused on open)
    - `textbox[name="Owner email"]`
    - Submit: `button[name="Create organization"]`
    - Close keeping draft: `form` -> `button[name="Close"]` or `Escape`
    - Discard draft: `button[name="Discard changes"]`
- **Organization detail (`/admin/organizations/$organizationId`):**
  - Heading matches created organization name; email delivery state shows
    `Email accepted by sender` when Mailpit accepts the owner invitation.
- **Access-denied state (non-operator personas such as `recipient` or `dana`):**
  - Shows text `Your account doesn’t have access to Merit administration.` with no
    `complementary` admin sidebar.
- **DevTools & Mailpit:**
  - `region[name="Merit development tools"]` includes `link[name="Mailpit inbox"]`
    (`http://127.0.0.1:8025`) and persona buttons (`Dana Reed`, `Robin Ellis`,
    `Merit operator`, `Invitation recipient`).

## Gotchas

- `/admin/*` defaults to `workspace` mode in `vp run ui:verify --route /admin/organizations`,
  which starts as `Dana Reed` (not `Merit operator`) unless the `merit-local-person=operator`
  cookie is set — so `/admin/organizations` renders the intentional access-denied state by
  default when unswitched.
- Organization creation dialog preserves drafts in IndexedDB; pressing `Escape` or `Close`
  returns focus to `Resume organization`, while `Discard changes` returns focus to
  `Create organization`.
- Provisioning emails require Mailpit (`vp run services:start`).
