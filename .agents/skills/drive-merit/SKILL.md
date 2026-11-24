---
name: drive-merit
description: Drive Storybook stories and the live Merit demo or workspace application deterministically to verify UI behavior, accessibility, keyboard focus, and user flows. Follows Launch -> Doctor -> Drive -> Evidence -> Cleanup using `vp run services:start`, `vp run ui:verify`, and user-POV feature maps. Use when verifying UI changes, reproducing browser bugs, or inspecting rendered states across desktop and mobile viewports.
---

# Drive Merit

Verify Storybook stories and live Merit application flows deterministically from a user's
point of view. Pair this skill with [UI verification](../../../docs/guides/ui-verification.md#verification).

## 1. Launch

Choose the smallest surface that proves the changed behavior:

- **Storybook stories (default, Postgres-free):** `vp run ui:verify` builds the cached static
  Storybook bundle (`@merit/storybook#build`), starts an isolated preview server on an
  ephemeral port, runs the curated visual targets across desktop (`1440x1000`) and mobile
  (`390x844`), and tears down the server automatically.
- **Targeted stories:** `vp run ui:verify --story <pattern>` filters `index.json` by
  substring, glob (`components-button*`), or regex (`/dialog--with/`). Pass `--story`
  multiple times or comma-separated.
- **Live app routes:** Start local services first (`vp run services:start`), then run
  `vp run ui:verify --route <path>`. `ui:verify` provisions an ephemeral PostgreSQL database,
  applies migrations, seeds example workspaces when in `workspace` mode, launches an isolated
  app server on a free port, and tears both down on exit.
  - Mode auto-inference: `/app*` and `/admin*` default to `workspace` (local fixture identity,
    no Clerk keys required); `/`, `/demo*`, `/docs*`, and `/privacy` default to `demo`.
    Override explicitly with `--mode demo|workspace`.
- **Interactive multi-step exploration:** When a workflow requires multi-step interaction
  (creating records, switching personas, checking Mailpit), work inside an isolated worktree
  (`vp run worktree:create <slug>`) and launch `vp run storybook`, `vp run dev`, or
  `vp run dev:workspace`.

## 2. Doctor

Before debugging an unexpected failure, confirm the runtime environment is healthy:

1. **Playwright Chromium installed:**
   `pnpm --filter @merit/test-support exec playwright install chromium`
   (include `firefox webkit` when running `:all` cross-browser suites).
2. **Local services running (for `--route` or live app driving):**
   `vp run services:start` starts PostgreSQL (`127.0.0.1:55432`), Mailpit
   (`http://127.0.0.1:8025`), and SeaweedFS via `compose.yaml`.
3. **Database clean (interactive workspace only):**
   Run `vp run @merit/db#db:migrate && vp run @merit/app#db:seed`, or `vp run db:reset`
   for a fresh Alder and Birch workspace. (`vp run ui:verify --route ...` creates its own
   ephemeral database and never touches your local database.)
4. **Fresh Storybook build:** `vp run ui:verify` automatically runs the cached
   `vp run @merit/storybook#build`. Set `MERIT_STORYBOOK_PREBUILT=1` only when reusing a
   just-built `tooling/storybook/dist`.

## 3. Drive

Use `vp run ui:verify` for deterministic checks and proof capture:

```sh
# Curated default Storybook sweep (desktop + mobile)
vp run ui:verify

# Targeted stories into a custom proof directory
vp run ui:verify --story patterns-form-dialog--with-context --out /tmp/ui-proof

# Live demo or workspace routes with structured JSON output
vp run ui:verify --route /demo,/app/alder/rounds --viewport both --json

# Pixel-exact Linux visual baseline comparison or update in Docker Playwright
vp run ui:verify --container
vp run ui:verify --container --update
```

When driving interactive flows in Playwright or a browser:

- **Query by accessible role and name only** (`getByRole`, `getByLabel`, `getByText`). Never
  rely on CSS module hashes, DOM structure, or pixel coordinates.
- **Switch local personas in `workspace` mode** via the **Open TanStack Devtools** button ->
  **Merit** tab (`Dana Reed`, `Robin Ellis`, `Merit operator`, `Invitation recipient`) or the
  `merit-local-person` cookie (`manager`, `reviewer`, `operator`, `recipient`).
- **Wait on observable readiness:** wait for `main` focus on route transitions,
  `[data-story-ready="true"]` on Storybook iframes, and absence of `[data-entering]` /
  `[data-exiting]` rather than fixed sleeps.
- **Compact navigation:** on mobile (`<= 600px`), open the navigation drawer with button
  `Open navigation` and close it with `Close navigation`.

### Feature maps (user POV)

Read the matching map before driving an area so routes, ARIA handles, and gotchas stay exact:

| Area                                            | Feature map                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Rounds, criteria, budget, workspace activity    | [Grantmaking and rounds](features/grantmaking-and-rounds.md)     |
| Applications intake, reviews, reviewer work     | [Applications and reviews](features/applications-and-reviews.md) |
| Funding recommendations, drafts, budget preview | [Recommendations](features/recommendations.md)                   |
| Shared contacts, team membership, invitations   | [Contacts and team](features/contacts-and-team.md)               |
| Marketing site, docs, demo entry, sign-in       | [Public demo and access](features/public-demo-and-access.md)     |
| Operator console, org provisioning, Mailpit     | [Admin and provisioning](features/admin-and-provisioning.md)     |
| Demo Merit AI panel and assistant HTTP API      | [Merit AI assistant](features/merit-ai-assistant.md)             |

## 4. Evidence

Every `vp run ui:verify` run writes deterministic proof artifacts (even on failure) to
`--out` (default `.tmp/ui-verify/`):

- `<out>/report.md` — human-readable pass/fail summary, per-target table, and failure details
- `<out>/results.json` — Zod-validated structured results (axe WCAG 2 A/AA/2.1AA violations,
  horizontal overflow, console/page errors, keyboard Tab focus stops and failures)
- `<out>/screenshots/<target>-<viewport>.png` — full-page captures (or viewport capture for
  fixed modal dialogs such as `patterns-form-dialog--with-context`)

Always inspect the captured screenshots visually beside the named precedent before claiming
a UI change is verified. For pixel-exact Linux visual baselines in
`tooling/storybook/snapshots`, run `vp run ui:verify --container` (and `--update` only for
intentional visual changes).

## 5. Cleanup

- `vp run ui:verify` automatically terminates its own child preview/dev servers and drops its
  ephemeral test database on exit, failure, `SIGINT`, or `SIGTERM`.
- If you launched an interactive `vp run dev`, `vp run dev:workspace`, or `vp run storybook`
  session, stop it when finished so ports remain free.
- Remove temporary worktrees with `vp run worktree:clean <slug>` when done.
