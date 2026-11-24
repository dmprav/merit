# Public demo and access

Reference workflow: [Public demo and access](../../../../docs/workflows/public-demo-and-access.md).

## Sub-features

- Public marketing landing page with interactive example tables and evidence preview
- Requesting an invitation dialog with validation and link to privacy notice
- Privacy notice (`/privacy`)
- Central documentation site (`/docs` and topic pages: `quickstart`, `workspaces`, `rounds`,
  `applications`, `reviews`, `recommendations`, `contacts`, `team`, `mcp`)
- Disposable personal demo workspace (free exploration `/demo` and guided `/demo/workshop-saturdays`)
- `Demo guide` drawer/panel and demo reset
- Account sign-in page (`/app/sign-in`)

## How to reach it (user POV)

- **Marketing site:** open `/` (no database required for rendering; requesting an invitation
  writes to PostgreSQL).
- **Privacy notice:** open `/privacy` or follow **Privacy notice (opens in a new tab)** from
  the invitation dialog.
- **Docs:** open `/docs` (or click **Documentation (opens in a new tab)** inside any workspace
  navigation).
- **Demo workspace:** visit `/demo` and click **Browse the workspace**, or visit
  `/demo/workshop-saturdays` and click **Explore the example**.
- **Sign-in:** visit `/app/sign-in` (or `/app` when running `demo` mode without local workspace
  fixtures).

## Driving handles / selectors

- **Marketing page (`/`):**
  - Hero heading: `heading[level=1]` (`Bring your grantmaking together.`)
  - Example table: `table[name="Applications"]`
  - Evidence section: `region[name="Keep evidence and judgments connected."]`
  - Invitation flow: `region[name="See how the pieces fit together."]` ->
    `button[name="Request an invitation"]` -> `dialog[name="Request an invitation"]` with
    `textbox[name="Email address"]` and `link[name="Privacy notice (opens in a new tab)"]`
- **Docs (`/docs`, `/docs/*`):**
  - Title: `Docs · Merit` (and `<Topic> · Merit`)
  - Mobile table of contents: `summary` containing `On this page`
- **Demo entry & workspace:**
  - Free entry (`/demo`): `button[name="Browse the workspace"]` -> redirects to
    `/app/demo-<id>/rounds`
  - Guided entry (`/demo/workshop-saturdays`): `button[name="Explore the example"]` -> opens
    `Workshop Saturdays · Merit`
  - Active demo indicator & controls: `button[name="Demo guide"]` (enabled once demo workspace
    is hydrated; includes **Reset demo**)
- **Sign-in (`/app/sign-in`):**
  - Development tools panel (`button[name="Open TanStack Devtools"]` ->
    `region[name="Merit development tools"]`) shows `Authentication: Clerk` in `demo` mode and
    `Local fixtures` in `workspace` mode.

## Gotchas

- `vp run ui:verify --route / --viewport desktop` runs in `demo` mode automatically (with
  Clerk keys blanked, matching `app/tests/browser/playwright.config.ts`).
- Guided (`/demo/workshop-saturdays`) and free (`/demo`) entry share the same personal demo
  workspace cookie per browser context and retain edits for seven days until **Reset demo**.
- Workspace **Documentation** links open in a new tab (`popup` event) so unfinished drafts in
  the workspace tab are never lost.
