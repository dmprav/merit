# Applications and reviews

Reference workflows: [Record applications](../../../../docs/workflows/record-applications.md),
[Request and record reviews](../../../../docs/workflows/review-applications.md), and
[Participate in a review](../../../../docs/workflows/participate-in-review.md).

## Sub-features

- Workspace applications table with round filtering, sorting, and scroll-restoration return
- Creating, editing, revising, marking ready for review, and deleting applications
- Reference material switching between applicant submission and reviewer assessments
- Requesting reviews from contacts, recording staff-entered assessments, and managing reviewer
  participation invitations
- Independent reviewer worklist (`My work`), accepting review invitations, pinning assignments
  to the sidebar, drafting, submitting, and amending assessments

## How to reach it (user POV)

- **All workspace applications:** open main navigation -> **Applications**
  (`/app/$workspaceSlug/applications`), or open a round's **Applications** tab.
- **Application detail:** click an application link (e.g. `Workshop Saturdays`,
  `Neighbour Table`, `Ride Together`) -> `/app/$workspaceSlug/applications/$applicationRef`
  (append `?tab=reviews` to open with reviewer assessments selected).
- **Independent reviewer (`workspace` mode as Robin Ellis):** switch local persona to
  **Robin Ellis** (`merit-local-person=reviewer`) and open `/app/alder/work`, then open an
  assignment (`/app/alder/work/$assignmentId`).

## Driving handles / selectors

- **Applications list (`/app/$workspaceSlug/applications`):**
  - Heading: `heading[name="Applications"]`, status count: `status` (e.g. `3 of 3 applications`)
  - Filtering/sorting: `button[name="Filter"]` -> `button[name="Round All rounds"]` ->
    `option[name="Local Connections 2027"]`; desktop column sort `button[name="Application"]`
    (mobile `button[name=/Sort applications/]`)
  - `button[name="Add application"]` is disabled until filtered to a specific round, or use
    `Add application` on a round's **Applications** tab (`dialog[name="Add application"]`:
    `textbox[name="Project title"]`, `textbox[name="Applicant"]`,
    `textbox[name="Requested amount"]`, `textbox[name="Submitted material"]`).
- **Application detail (`/app/$workspaceSlug/applications/$applicationRef`):**
  - Header & menu: `button[name="Mark ready for review"]`,
    `button[name="Application actions"]` -> `menuitem[name="Delete application"]` -> confirm in
    `dialog[name="Delete application"]`
  - Details & submission editors: `button[name="Edit application details"]` ->
    `form[name="Edit application details"]` (`textbox[name="Applicant"]`,
    `textbox[name="Requested amount"]`, `button[name=/Applicant contact/]`, `button[name="Save"]`);
    `button[name="Edit applicant submission"]` / `button[name="Continue editing applicant submission"]`
    -> `form[name="Edit applicant submission"]` (`button[name="Add section"]`,
    `textbox[name="Heading or question"]`, `textbox[name="Applicant’s response"]`)
  - Reference switcher: `button[name=/^Reference material:/]` ->
    `menuitem[name="Reviewer assessments"]`
  - Reviews management: `button[name="Add"]` -> `menuitem[name="Request review"]`
    (`dialog[name="Request review"]`, `textbox[name="Find a contact"]`) or
    `menuitem[name="Record assessment"]` (`form[name="Record assessment"]`);
    `button[name="Manage reviews"]` -> `region[name="Reviewer participation"]` ->
    `button[name="Invite reviewer"]`
  - Existing assessment cards: `article[name="Assessment by Sam Morgan"]`, expand
    `Review details` (`region[name="Review details"]`) to verify submission/criteria version
- **Reviewer workspace (`/app/$workspaceSlug/work` & `/work/$assignmentId`):**
  - Heading: `heading[name="My work"]`
  - Invitation acceptance: `button[name="Accept review"]` reveals
    `heading[name="Application material"]`
  - Sidebar pin toggle: `button[name="Pin <title> to sidebar"]` (`aria-pressed="true"`),
    visible in `list[name="Pinned review assignments"]`

## Gotchas

- `Requested amount` enforces exact EUR minor-unit precision (at most 2 decimals); extra
  decimal digits are rejected on typing and paste.
- `Mark ready for review` stays disabled until required application details and submitted
  material are filled in.
- Reviewers only see `My work` and assigned applications — links to `Funding rounds`,
  `Contacts`, and `Workspace settings` are intentionally hidden and inaccessible.
- Breadcrumb navigation (`navigation[name="Breadcrumb"]`) preserves query parameters
  (`?round=...&sort=...&direction=...`) and scroll position when returning to the list.
