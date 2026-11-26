# Grantmaking and rounds

Reference workflow: [Prepare a round](../../../../docs/workflows/prepare-round.md) and
[Grantmaking overview](../../../../docs/workflows/review-and-decide.md).

## Sub-features

- Workspace funding rounds list and status overview
- Creating, renaming (inline with Undo), and deleting empty funding rounds
- Editing round purpose, budget, schedule, and review criteria
- Round tabs (`Overview` and `Applications`)
- Workspace activity audit log with round filtering and links back to rounds/applications

## How to reach it (user POV)

- **Seeded workspace (`workspace` mode as Dana Reed):** open `/app` (redirects to
  `/app/alder/rounds`) or navigate directly to `/app/alder/rounds`.
- **Demo workspace (`demo` mode):** open `/demo`, click **Browse the workspace**, which
  lands on `/app/demo-<id>/rounds`.
- **Open a round:** click a round link in the `Funding rounds` table (e.g.
  `Local Connections 2027`) to reach `/app/$workspaceSlug/rounds/$roundRef`.
- **Workspace activity:** open main navigation and click **Activity**
  (`/app/$workspaceSlug/activity`).

## Driving handles / selectors

- **Rounds list (`/app/$workspaceSlug/rounds`):**
  - Table: `table[name="Funding rounds"]`
  - Primary action: `button[name="Create funding round"]` -> opens
    `dialog[name="Create funding round"]` with `textbox[name="Round name"]` and submit
    `button[name="Create funding round"]` (or `Close` / `Discard draft`)
  - Round row link: `link[name="Local Connections 2027"]`
- **Round detail (`/app/$workspaceSlug/rounds/$roundRef`):**
  - Inline title edit: click `button[name="<Round title>"]` -> `textbox[name="Edit round name"]`
    (press `Enter` to save; `button[name="Undo"]` appears in status feedback)
  - Tabs: `tab[name="Overview"]`, `tab[name=/Applications/]`
  - Section editors (each opens an inline `form` named after the action):
    - `button[name="Edit purpose"]` -> `form[name="Edit purpose"]`, `textbox[name="Purpose"]`,
      `button[name="Save changes"]`, `button[name="Close"]`
    - `button[name="Edit criteria"]` -> `form[name="Edit criteria"]`,
      `button[name="Add criterion"]`, `textbox[name="Title"]`,
      `textbox[name="Reviewer guidance"]`, `button[name="Save changes"]`
  - Add application inside `Applications` tab: `button[name="Add application"]`
- **Navigation & Activity:**
  - Main navigation (desktop sidebar `complementary`, mobile drawer `dialog` via
    `button[name="Open navigation"]`): `link[name="Funding rounds"]`,
    `link[name="Applications"]`, `link[name="Contacts"]`, `link[name="Activity"]`,
    `link[name="Workspace settings"]`

## Gotchas

- `AppPage` moves focus to `main` (`tabindex="-1"`) after hydration and route changes — wait
  for `main` to be focused before pressing shortcuts or inspecting route readiness.
- Seeded workspace has `alder` (accessible to Dana Reed) and `birch` (inaccessible to Dana;
  visiting `/app/birch/...` intentionally shows an unavailable state).
- Organization administrators without grant-work access are redirected away from
  `/app/$workspaceSlug/rounds` and `/activity` to `/app/$workspaceSlug/settings/members`.
- On desktop, the round detail page scrolls inside `[data-scroll-restoration-id="properties-layout"]`
  or `#main [role="tabpanel"]` rather than `window.scrollY`.
