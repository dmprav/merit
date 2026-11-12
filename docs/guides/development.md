# Develop Merit locally

Run commands from the repository root. Choose the [public demo](#run-the-public-demo)
or a [protected workspace](#protected-workspace), then use [verification](verification.md)
to check a change.

## Set up the toolchain

Install the [Vite+ global CLI](https://viteplus.dev/guide/global-cli) (`vp`),
enable environment management when prompted, and open a new shell. The global
CLI provisions Node.js and pnpm; Node.js does not need to be installed first.
The project's `vite-plus` dependency supplies the development tools, while the
global CLI supplies `vp env` and runtime management.

```sh
vp env install
vp env current
```

Vite+ reads the exact Node.js version from [`.node-version`](../../.node-version)
and the pnpm version from [`devEngines.packageManager`](../../package.json).
`vp env current` shows the resolved versions. If environment management was
disabled in an existing Vite+ installation, run `vp env on` to enable it.

To update Node.js, run `vp env pin node@<version> --target node-version` with a
version satisfying `engines.node` in `package.json`. Review the resulting exact
pin and run `vp run ready` before committing the update.

### Security tools

Secret scanning needs no separate installation. The
[scanner command](../../tooling/verification/secrets.ts) runs
[secretlint](https://github.com/secretlint/secretlint) from the workspace
dependencies, so the lockfile pins the same rule set for every contributor and CI.
Update it like any other catalog dependency and run `vp run test:security` with the
upgrade.

Dependency auditing uses the workspace's existing pnpm and needs access to the
npm advisory registry. [Security checks](verification.md#security-checks) explain
scan scope and how to handle findings.

## Run the public demo

```sh
vp install
docker compose up -d --wait
vp run @merit/db#db:migrate
vp run dev
```

Open [localhost:3000](http://localhost:3000). The public website needs no database. The demo uses PostgreSQL, but needs no
Clerk account or keys. Choosing **Explore the example** or **Browse the workspace**
from the introduction provisions a personal fictional workspace;
regular workspace routes and server operations carry out its work. Development
runs in Cloudflare's local Worker runtime. MCP requires an authenticated account.

The [README](../../README.md#available-today) describes the available workflows.
For client connections, follow the [MCP guide](mcp.md).

## Protected workspace

The persisted workspace uses PostgreSQL. For everyday feature development, run
it with a local fixture identity; no Clerk account or keys are needed. Use a
Clerk development application when checking real sign-in or protected MCP OAuth.

### Start and seed PostgreSQL

```sh
docker compose up -d --wait
vp run @merit/db#db:migrate
vp run @merit/app#db:seed
```

PostgreSQL listens on `127.0.0.1:55432`. Its local credentials are `merit` / `merit`;
the database is `merit`. Docker stores data in a named volume across restarts.
Use `docker compose stop` to stop it without deleting data.

Compose also starts [Mailpit](organizations.md#try-the-complete-flow-locally) for
local invitation emails. The seed creates example workspaces for Alder and Birch. Repeating it preserves
existing content and memberships. If you have a database from before the current
schema baseline, see [local database recovery](#local-database-recovery).

### Work locally without Clerk

After migrating and seeding PostgreSQL, run:

```sh
vp run dev:workspace
```

Open [the local workspace](http://127.0.0.1:3000/app) as fictional program manager
Dana Reed. Alder's funding rounds should appear; Birch remains inaccessible.
Edits persist in PostgreSQL. Use the workspace's Docs link for supported tasks
and the [workflow index](../workflows/README.md) for their rules.
On a freshly seeded database, the local Dana identity also owns Alder and can
manage its Team. Existing memberships are preserved when reseeding; provision a new
organization through the operator flow to try ownership on an older database.
Access uses the same database permissions and business operations as real sign-in.

The TanStack DevTools button sits midway down the left edge to keep form footer
actions reachable. It is available across the website, admin app, and workspace
in development. Its **Merit** tab shows the authentication
mode and links to the admin app, workspace, and Mailpit; **TanStack Router** inspects
routes and loaders; **TanStack Query** inspects cached reads and mutations. In local workspace mode, switch between Dana Reed, the Merit
operator, and the invitation recipient. Switching reloads the current page and
clears unsaved changes. The selected fixture persists across pages until you switch
again. See [organization provisioning](organizations.md) for the invitation flow.
DevTools and fixture controls are excluded from production builds.

Local mode binds to `127.0.0.1` and requires a loopback database connection.
Use only fictional local data; do not expose this server through a tunnel or proxy.
Starting it does not reseed data or restore revoked permissions. To return to
ordinary development, stop the server and run `vp run dev`.

Use `DATABASE_URL` to select another local PostgreSQL database for migration,
seeding, and development. The [reset command](#local-database-recovery) always uses
the repository's Compose database.

Clerk keys, if present, are ignored for web identity in this mode. Protected MCP
still requires real OAuth. Local mode is available only in the development server.
Both development modes allow `CLERK_SECRET_KEY` and `RESEND_API_KEY` to be absent:
the local server supplies empty defaults, and invitation emails use Mailpit.
Configure Clerk credentials when testing real sign-in or protected MCP. Production
builds retain both required secret declarations.

The [application configuration](../../app/local-workspace.config.ts) and
[isolation tests](../../app/tests/local-workspace.integration.ts) define how
local mode selects the database and identity adapter and stays out of builds.

### Configure real sign-in

1. Create a development application in the [Clerk dashboard](https://dashboard.clerk.com/)
   and enable a sign-in method, such as email.
2. Copy [`app/.env.example`](../../app/.env.example) to `app/.env.local` and set
   `VITE_CLERK_PUBLISHABLE_KEY` to the application's publishable key.
3. Copy [`app/.dev.vars.example`](../../app/.dev.vars.example) to `app/.dev.vars`.
   Set `CLERK_PUBLISHABLE_KEY` to the same key, `CLERK_SECRET_KEY` to the secret key,
   and `CLERK_ISSUER` to the instance's HTTPS Frontend API URL. Keep secrets in
   `.dev.vars`; only the publishable key belongs in a `VITE_` variable.
4. Run `vp run dev`, visit `/app/sign-in`, and create a development user. Copy its
   `user_…` ID from Clerk's user page, then link it to the local Alder manager:

   ```sh
   vp run @merit/app#db:seed user_YOUR_DEVELOPMENT_USER_ID
   ```

5. Open [the workspace](http://localhost:3000/app). Alder's round should
   appear. Changing `alder` to `birch` in the round URL must show “Round not available.”

A new sign-up needs a Merit membership to enter a workspace. Use
[organization provisioning](organizations.md) to invite real users into new
workspaces. Members with program-manager access can
read round and application details and save recommendations. Saves persist in
PostgreSQL, reject stale edits, and record the change and its author together.

## Change the application

Use the [architecture](../foundations/architecture.md) to choose the owning capability or interface.
Follow the [application structure](../foundations/architecture.md#application-structure)
when placing interface code, app composition, and test helpers.
The [web feature guide](web-features.md) maps editing behavior, data/cache effects,
and typed navigation to their owners. See [UI development](ui.md) for components, interface copy, and Storybook,
[email development](emails.md) for invitation templates and previews, and
[documentation](documentation.md) when changing written guidance.

### Define run commands

Define commands in the owning package's `vite.config.ts` under `run.tasks`;
the root configuration owns workspace shortcuts and verification orchestration.
Use a command string for a simple task, an array for sequential commands, and
an object when the task needs `dependsOn` or cache settings. Run them with
`vp run <task>` or `vp run <package>#<task>`. Only package-manager lifecycle hooks,
such as `prepare`, belong in `package.json` scripts.

Tasks are cached by default. Set `cache: false` for development servers, watch
commands, database operations, deployment, and checks that must always execute.
Keep coverage-report exclusions and build outputs with their owning task.
The [verification guide](verification.md) explains cache behavior and the
ordering of required checks.

## Schema changes

After changing a table definition:

```sh
vp run @merit/db#db:generate
# Review the generated SQL and metadata in foundation/db/database/migrations.
vp run @merit/db#db:migrate
```

Every schema change has a reviewed, committed migration so each environment can
reproduce the same database structure. Before the first deployment, migrations
may be consolidated into a fresh baseline; existing local databases then need
[recreation](#local-database-recovery). Preserve the handwritten public-ID function,
deferred current-version foreign keys, content checks, outstanding-review index,
and version, reviewer-event, authorship, and audit immutability triggers when
regenerating the baseline. Once deployed, keep applied migrations
unchanged and add a new migration for subsequent changes.
`vp run @merit/db#db:check` checks migration metadata.

## Local database recovery

The current pre-deployment baseline is
[`0000_initial.sql`](../../foundation/db/database/migrations/0000_initial.sql).
It creates the complete current schema, including reviewer participation, navigation
pins, capability-owned revisions, and audit provenance, in one migration.
Recreate all databases initialized before this baseline, including those whose
first migration was also named `0000_initial.sql`. The baseline has no upgrade
or backfill path for prototype data; rerunning migrations does not reset it.
The local seed and public demo share the same capability-owned scenario builder,
including the revised submission's authored history. The current history format
requires stable question and criterion IDs and does not read earlier prototype formats. Recreate databases from before this format
reset; rerunning the seed preserves existing work and will not upgrade snapshots.

After initializing this baseline, apply future changes through the normal
[schema-change procedure](#schema-changes).

To replace the disposable local Compose database, stop the development server and run:

```sh
vp run db:reset
```

This deletes all stored Compose data, restarts PostgreSQL and Mailpit, waits for
readiness, applies migrations, and seeds fresh Alder and Birch workspaces. It
ignores `DATABASE_URL` and uses the Compose database at `127.0.0.1:55432/merit`.
The command stops if any step fails.

Restart the development server afterward. Repeat the
[Clerk user-linking step](#configure-real-sign-in) if using real sign-in;
resetting removes those membership links too.

Browser drafts use IndexedDB through [`@merit/drafts`](../../foundation/drafts/README.md).
They recover in the same browser profile after reload or reopening the browser.
Features own versioned draft formats; only the current version is accepted.
Incompatible payloads remain stored and produce a recovery warning. Earlier
prototype draft formats and session-storage drafts are not imported. After this
predeployment reset, close the site's tabs and clear its browser storage before
reopening it. Sign-out, account changes, and demo reset clear the appropriate drafts.

## Verification

For ordinary tasks, choose targeted checks and stop when they pass, following the
[verification policy](verification.md#verification). Browser commands default to
desktop Chromium; include other supported browsers when the changed behavior
requires them.

At the full verification milestones defined by that policy, run the workspace
checks with PostgreSQL and Mailpit running. Install the browsers once, and again
after upgrading Playwright:

```sh
pnpm --filter @merit/test-support exec playwright install chromium firefox webkit
vp run ready
```

[Verify a change](verification.md) explains targeted checks, browser compatibility,
performance, and database integration. [Write and maintain tests](testing.md)
covers test design, fixtures, and coverage. Use [coding conventions](coding-conventions.md)
when writing or reviewing code.

### Coverage policy changes

Follow the [coverage policy](testing.md#coverage-policy-changes) before weakening
coverage or required tests; it requires explicit user approval.

## Commit changes

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
so history communicates each change's intent. Keep each commit focused on one
coherent outcome and write its subject as `type(scope): description`, with the
scope optional.

| Type       | Use for                                    |
| ---------- | ------------------------------------------ |
| `feat`     | New product capabilities                   |
| `fix`      | Corrections to existing behavior           |
| `docs`     | Documentation changes                      |
| `refactor` | Code restructuring that preserves behavior |
| `test`     | Test additions or corrections              |
| `perf`     | Performance improvements                   |
| `build`    | Dependencies and build tooling             |
| `ci`       | Continuous integration configuration       |
| `chore`    | Maintenance outside the categories above   |

Choose the type for the overall outcome: a feature with tests is still `feat`.
When a scope helps, name the capability or shared area, such as `applications`,
`reviews`, or `organizations`. Scopes are optional and have no fixed registry.
Use lowercase types and scopes, a concrete imperative description, no trailing
period, and at most 100 characters in the subject. Preserve names and acronyms.
Separate an optional body or footer from the preceding section with a blank line.

```text
feat(reviews): add reviewer assignment
fix(organizations): prevent duplicate invitations
docs: clarify local verification steps
```

For a breaking change, add `!` before the colon and explain the incompatibility
and migration in the body. A `BREAKING CHANGE:` footer is also recognized.

```text
feat(mcp)!: require a workspace identifier for review queries

Clients must include the workspace identifier when requesting reviews.
Update integrations to pass the selected workspace before upgrading.
```

`vp install` runs the existing `prepare` lifecycle to install Vite+ hooks.
The [commit-msg hook](../../.vite-hooks/commit-msg) validates the message file
with the root [commitlint configuration](../../commitlint.config.mjs), after
the existing pre-commit checks. If validation fails, correct the reported message
and retry the commit. To check a draft message without committing:

```sh
vp run check:commit /path/to/commit-message.txt
```

Commitlint's default ignores allow Git-generated merge and revert messages and
temporary `fixup!` and `squash!` messages. Resolve temporary messages during the
rebase before merging. The hook checks message syntax; reviewers still assess
scope, clarity, and migration instructions. Validation is local and does not
enforce messages created through GitHub.

## GitHub repository rules

The public GitHub repository is [dmprav/merit](https://github.com/dmprav/merit),
owned by Dmitrii Pravotorov. Both branch rulesets and the security settings below
were enabled and verified through the GitHub API on November 12, 2026.

### Branch protection

The repository owner reviews contributions and is the only person allowed to
merge. Bots may open and update pull requests, but the owner reviews and merges
them manually. Other contributors work in forks and submit pull requests without
write access to the upstream repository.

Two rulesets enforce this policy together:

- [Protect main](../../.github/rulesets/main.json) requires pull requests
  and resolved review conversations, a passing `verify` check from GitHub Actions
  against the latest `main`, and blocks force pushes and deletion of `main`.
  It requires no approving reviews so a sole maintainer can merge their own work.
  The bypass list is empty, so administrators follow the same merge rules.
- [Restrict main merges](../../.github/rulesets/main-merge-access.json) restricts
  updates to `main`, with a pull-request-only exception for the repository
  administrator role (`RepositoryRole`, ID `5`). It grants no bot exceptions.

Keep the owner as the sole repository administrator. The exception covers a role,
not a named account; granting another account administrator access would also
grant merge access. Bots must use separate identities, such as GitHub Apps, rather
than the owner's credentials: automation authenticated as the owner inherits the
owner's access. Keep the merge restriction separate from **Protect main** so its
exception cannot bypass the shared protections. GitHub applies
[both rulesets together](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

The [PR verification workflow](../../.github/workflows/verify.yml) runs `vp run --no-cache ready:ci`
for pull requests targeting `main`. **Protect main** requires its `verify` check
from GitHub Actions (integration ID `15368`); a pending or failed check blocks
merging, including for administrators.

These JSON files record the ruleset configurations; committing changes to them
does not update GitHub. Update the existing rulesets through the repository's
settings or the authenticated GitHub CLI from the repository root:

```sh
gh api --method PUT repos/dmprav/merit/rulesets/27139675 --input .github/rulesets/main.json
gh api --method PUT repos/dmprav/merit/rulesets/27139676 --input .github/rulesets/main-merge-access.json
```

Confirm that **Protect main** and **Restrict main merges** are both active in
GitHub and target `main`. Verify that the owner can merge a PR with resolved
conversations, while a bot using its own identity cannot merge it. Confirm that
direct pushes remain blocked for the owner as well. For later changes, update
the existing ruleset and its JSON together rather than creating a duplicate.
When renaming the workflow job, update the required check and
`.github/rulesets/main.json` together. Confirm that a failing or pending check
blocks merging.

### Security reports and alerts

The [security policy](../../SECURITY.md) links to the enabled GitHub private
reporting form. A separate security email address is not required.

The following settings are enabled in **Settings → Advanced Security**:

- **Private vulnerability reporting** for the public repository.
- **Dependency graph** and **Dependabot alerts**.
- **Dependabot security updates**, which propose fixes through pull requests.
- **Secret scanning** and repository **push protection**.
- **CodeQL default setup** with the default query suite. Setup is configured,
  and scans begin when supported source code reaches the default branch.

Follow GitHub's [security settings guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository)
and [private reporting setup](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
Confirm that **Report a vulnerability** appears on the repository's **Advisories**
page before advertising GitHub private reporting. Enable maintainer notifications
for private reports and security alerts, and review existing findings. Keep the
reporting link in [the security policy](../../SECURITY.md) current. These settings
complement the [local security checks](verification.md#security-checks).
Committing documentation does not enable them.

### Dependency updates

[Renovate configuration](../../renovate.json) allows new update branches on
weekdays from midnight to 06:00 in Europe/Berlin, with at most five ordinary
update PRs open. Lockfile maintenance runs in the Monday window. These windows
allow work when Renovate runs; they do not trigger a run. Vulnerability fixes
bypass the ordinary schedule and receive the `security` label.

Updates require manual merging, and major upgrades require approval in the
Dependency Dashboard before Renovate opens a PR. The Playwright ceiling preserves
the [Firefox workaround](verification.md#browser-compatibility); remove it only
after verifying a stable upstream fix. The npm release-age preset delays ordinary
updates for three days, but does not enforce that age for dependencies selected
during lockfile maintenance. OSV alerts supplement the existing dependency audit;
they cover direct npm dependencies and remain experimental.

The required Verify job validates changes to `renovate.json` or its own workflow
with Renovate's strict repository-config validator, using a version- and
digest-pinned container. Manual Verify runs also validate the configuration.
Warnings, errors, and required configuration migrations fail the check. Use
**Actions → Verify → Run workflow** to recheck the configuration. Review the
onboarding preview or Dependency Dashboard as well: validation checks configuration
validity, not whether package rules select the intended updates.

### Pull-request verification

The [Verify workflow](../../.github/workflows/verify.yml) uses one Ubuntu 24.04 job
to run `vp run ready:ci` with fresh task results (`--no-cache`). This temporarily
excludes presentation and tooling self-tests under the
[approved verification exception](verification.md#temporary-pr-verification-exception).
Only downloaded dependencies are cached between CI runs. It reads the existing
Vite+, Node.js, and pnpm pins, installs dependencies with the frozen lockfile,
and starts PostgreSQL and Mailpit through `compose.yaml`. The root task configuration
continues to own check ordering, parallelism, and coverage requirements.
CI uses the normal parallel task scheduling and no extra Vitest worker cap.
Browser installation is deferred with the browser suites.

The non-required [Deferred verification workflow](../../.github/workflows/deferred.yml)
runs each stage of `vp run --no-cache ready` as a separate step with the same setup
on pull requests, nightly at 09:17 UTC, and through **Actions → Deferred verification**.
It installs Chromium, Firefox, and WebKit and caches them by the locked Playwright
version, saving the cache before verification so failing runs reuse it. It
uploads the `deferred-verification` artifact for fourteen days after every run.
[Verification](verification.md#temporary-pr-verification-exception) explains how
its results decide when to restore the full required gate.

New commits cancel the previous run for that PR. Failed runs retain verification
and service logs, browser screenshots, and traces in the `verification-failure`
artifact for seven days. A manual run is also available through **Actions → Verify**
after the workflow reaches the default branch. For screenshot failures, follow
[visual baseline review](ui-verification.md#review-visual-changes); CI never accepts
new screenshots automatically.

PR verification runs without production credentials, using disposable databases
and fixture identities. The workflow uses `pull_request`, read-only repository
permissions, no persisted checkout credentials, and full commit SHA pins for
external actions. Keep deployment credentials in a separate deployment environment
restricted to trusted branches; do not execute untrusted pull-request code in a
privileged workflow. Follow GitHub's
[Actions security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## Demo lifecycle checks and cleanup

`vp run test:browser:app` creates a disposable database and checks the anonymous
demo through the real application in desktop Chromium. Use its `:all` variant for
the [full browser matrix](verification.md#browser-compatibility). Integration tests in
`app/tests/demo.integration.ts` cover separate visitors, concurrent starts,
reset retries, expiry, rollback, and cleanup. Identity tests cover account mapping
and hashed guest sessions. No Clerk credentials are needed for these checks.

Run `vp run @merit/app#demo:cleanup` to remove expired demo content and unused
expired guest identities. It uses `DATABASE_URL` (the local database by default).
The command only removes expired demo workspaces; standard workspaces and signed-in
users remain. Use an operator database credential for this command, not the web
runtime credential, because deletion includes the disposable demo's audit history.
