# Recommendations

Reference workflow: [Recommend funding](../../../../docs/workflows/recommend-funding.md).

## Sub-features

- Viewing saved funding recommendations alongside application material and reviewer assessments
- Editing or resuming a draft recommendation (`Fund`, `Defer`, `Decline`), proposed allocation,
  and reasoning
- Live round budget preview (`Remaining with draft` / `Remaining if approved`)
- IndexedDB draft persistence across reloads, tab closure, and opening central Docs
- Multi-tab draft conflict detection and discard/reconcile actions

## How to reach it (user POV)

- **Workspace or demo:** open any application detail page
  (`/app/$workspaceSlug/applications/$applicationRef`, e.g. `Workshop Saturdays` or
  `Neighbour Table` in `Local Connections 2027`).
- **Guided demo shortcut:** visit `/demo/workshop-saturdays` and click **Explore the example**
  to land directly on `Workshop Saturdays` with the recommendation panel beside the material.
- **Isolated Storybook story:** `features-applications-recommendation--resume-editing`.

## Driving handles / selectors

- **Open / resume editor:**
  - `button[name="Edit recommendation for <Application title>"]`
  - When an unsaved local draft exists:
    `button[name="Resume editing recommendation for <Application title>"]`
- **Recommendation form fields:**
  - Position select: `button[name=/Recommendation$/]` -> options `option[name="Fund"]`,
    `option[name="Defer"]`, `option[name="Decline"]`
  - Proposed amount (shown only when position is `Fund`): `textbox[name="Proposed allocation"]`
  - Reasoning: `textbox[name="Reasoning"]`
  - Live budget status: `status[name="Budget preview"]` (contains `term` such as
    `Remaining with draft` and formatted EUR `definition`)
- **Commit / close / conflict controls:**
  - Save: `button[name="Save recommendation"]`
  - Close preserving draft: `form` -> `button[name="Close"]`
  - Multi-tab conflict banner text: `/Another tab changed a saved draft/` with
    `button[name="Discard changes"]`

## Gotchas

- Selecting `Defer` or `Decline` removes the `Proposed allocation` field and updates the
  `Budget preview` immediately without saving.
- Drafts are stored in IndexedDB database `merit-drafts` (object store `drafts`). Switching
  accounts, signing out, or clicking **Reset demo** clears stored drafts; opening `/docs` in a
  new tab preserves the draft untouched.
- Server saves enforce optimistic concurrency (revision checks); stale edits from another tab
  require reconciling before saving.
- On the application detail screen, closing the recommendation editor keeps the reading
  position and selected reference material intact.
