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
runs on Node.js. MCP requires an authenticated account.

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
local invitation emails and SeaweedFS for
[private file storage](../../foundation/storage/README.md#configure-a-bucket).
The seed creates example workspaces for Alder and Birch. Repeating it preserves
existing content, review work, memberships, and revoked permissions. If you have a database from before the current
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
routes and loaders; **TanStack Query** inspects cached reads and mutations. In local workspace mode, switch between Dana Reed, reviewer Robin Ellis (`reviewer@example.test`), the Merit
operator, and the invitation recipient. Robin opens Alder’s My work with two seeded
review invitations; accept an assignment to read, draft, and submit an assessment.
Switching opens the workspace home and
clears unsaved changes. The selected fixture persists across pages until you switch
again. See [organization provisioning](organizations.md) for the invitation flow.
DevTools and fixture controls are excluded from production builds.

Local mode binds to `127.0.0.1` and requires a loopback database connection.
Use only fictional local data; do not expose this server through a tunnel or proxy.
Starting it does not reseed data or restore revoked permissions. To return to
ordinary development, stop the server and run `vp run dev`.

The default Compose setup uses an owner connection for migration and seeding and
a restricted login for the running server. For another local database, set
`DATABASE_URL` separately for those commands using the corresponding credentials
in the [deployment guide](deployment.md#check-runtime-privileges). The [reset command](#local-database-recovery) always uses
the repository's Compose database.

Clerk keys, if present, are ignored for web identity in this mode. Protected MCP
still requires real OAuth. Local mode is available only in the development server.
Both development modes allow `CLERK_SECRET_KEY` and `RESEND_API_KEY` to be absent:
the local server supplies empty defaults, and invitation emails use Mailpit.
Configure Clerk credentials when testing real sign-in or protected MCP.

The [application configuration](../../app/local-workspace.config.ts) and
[isolation tests](../../app/tests/local-workspace.integration.ts) define how
local mode selects the database and identity adapter and stays out of builds.

### Configure real sign-in

1. Create a development application in the [Clerk dashboard](https://dashboard.clerk.com/)
   and enable a sign-in method, such as email.
2. Copy [`app/.env.example`](../../app/.env.example) to `app/.env.local` and set
   `VITE_CLERK_PUBLISHABLE_KEY` to the application's publishable key.
3. In that same file, set `CLERK_PUBLISHABLE_KEY` to the matching key,
   `CLERK_SECRET_KEY` to the secret key, and `CLERK_ISSUER` to the HTTPS Frontend
   API URL. Only variables prefixed with `VITE_` are exposed to the browser.
   Restart the dev server after changing its environment.
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

Follow the [database schema guide](database.md) when designing or altering
tables. After changing a table definition:

```sh
vp run @merit/db#db:generate
# Review the generated SQL and metadata in foundation/db/database/migrations.
vp run @merit/db#db:migrate
```

Every schema change has a reviewed, committed migration so each environment can
reproduce the same database structure. Before the first deployment, migrations
may be consolidated into a fresh baseline; existing local databases then need
[recreation](#local-database-recovery). When regenerating the baseline, carry forward
the handwritten SQL for public IDs, deferred foreign keys, content checks, the
outstanding-review index, the audit organization foreign key, and immutability
triggers. Keep the search extensions and indexes, workspace row-security policies
and helpers, and reviewer delivery function with its restricted privileges.
Once deployed, keep applied migrations unchanged and add a migration for each change.
`vp run @merit/db#db:check` checks migration metadata.

## Local database recovery

The current pre-deployment baseline,
[`0000_initial.sql`](../../foundation/db/database/migrations/0000_initial.sql),
creates the complete schema in one migration. Recreate all databases initialized
before this baseline, including those whose first migration had the same name.
The baseline has no upgrade or backfill path for prototype data; rerunning
migrations or the seed preserves existing work and does not upgrade it.

To replace the disposable local Compose database, stop the development server and run:

```sh
vp run db:reset
```

This deletes all stored Compose data, restarts the Compose services, waits for
readiness, applies migrations, and seeds fresh Alder and Birch workspaces. It
ignores `DATABASE_URL` and uses the Compose database at `127.0.0.1:55432/merit`.
The command stops if any step fails.

Restart the development server afterward. Repeat the
[Clerk user-linking step](#configure-real-sign-in) if using real sign-in;
resetting removes those membership links too.

Browser drafts use IndexedDB through [`@merit/drafts`](../../foundation/drafts/README.md).
They recover in the same browser profile after reload or reopening the browser.
Features own versioned draft formats; only the current version is accepted.
Incompatible payloads remain stored and produce a recovery warning. Sign-out,
account changes, and demo reset clear the appropriate drafts.

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

Pull requests are squash-merged. GitHub uses the PR title as the commit subject
and the description as its body, so the description is the lasting record of
why the change was made; the [PR template](../../.github/pull_request_template.md)
explains what to include. Edit the message in the merge box when the description
holds anything that won't stay true, such as notes for the reviewer.

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

**Protect main** requires the [PR verification workflow](../../.github/workflows/verify.yml)
to report a passing `verify` check from GitHub Actions (integration ID `15368`).
A pending or failed check blocks merging into `main`, including for administrators.

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

When a pull request changes `renovate.json`, or on manual Verify runs, the `renovate`
job validates the repository configuration with Renovate's strict validator using
a version- and digest-pinned container. Warnings, errors, and required configuration
migrations fail the check. Use **Actions → Verify → Run workflow** to recheck the
configuration. Review the onboarding preview or Dependency Dashboard as well:
validation checks configuration validity, not whether package rules select the
intended updates.

### Pull-request verification

The [Verify workflow](../../.github/workflows/verify.yml) runs on pull requests
targeting any branch, merge groups and pushes for `main`, and manual dispatch. It starts
with a `changes` job ([`ci-changes.ts`](../../tooling/verification/ci-changes.ts))
that diffs against the PR base commit:

- Documentation-only pull requests (including package `README.md` files and
  verification records) route through `docs-verify` (`check:docs`, `test:docs`,
  formatting, `check:secrets`, and `test:ci`).
- `renovate.json`-only pull requests, with or without a verification record, route
  through `renovate` and `docs-verify`.
- Pull requests touching root/workflow configuration, pushes to `main`, `merge_group`,
  and manual dispatch runs execute every `ready` stage with fresh task results
  (`--no-cache`).
- Package-scoped pull requests always run `build`, `static-checks`, and
  `security-checks`, and use the workspace dependency graph to run `package-tests`,
  `storybook-vitest`, `integration`, `tooling-self-tests`, and the `browser-*`
  suites only for affected dependents.
- `security-checks` always fails on secrets. The dependency audit fails it only
  when the change edits a `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`,
  when the diff is unknown, or on manual dispatch. Pushes and merge groups diff
  against the previous commit for this decision. Other runs report advisories as a
  warning in the job summary.

The container-backed Playwright suites `browser-storybook`, `browser-demo`, and
`browser-workspace` wait on both `build` and `static-checks` so lint, type, or
boundary failures fail fast; they run all five browser projects, sharded. A
test that fails runs once more so the step summary separates flaky tests from
consistent failures; a flaky test still fails the job, and the failed attempt
keeps its trace. The workflow file defines each job's commands, shards, and services.

On every pull request, the `verification-record` job
([`verification-record.ts`](../../tooling/verification/verification-record.ts)) checks
the pull request's [verification record](verification.md#record-verification).
The `verify` aggregator job collects all job results and publishes the required `verify`
status check. Jobs read the existing Vite+, Node.js, and pnpm pins and cache only
downloaded dependencies between CI runs.

New commits cancel the previous run for that PR. Vitest and Playwright emit GitHub
annotations and structured job summaries via `ci:summary`
([`ci-summary.ts`](../../tooling/verification/ci-summary.ts)), and failed package,
integration, or browser jobs retain service logs, browser screenshots, traces, and
JSON/JUnit reports in artifacts for seven days. A manual run is also available through
**Actions → Verify** after the workflow reaches the default branch. For screenshot
failures, follow [visual baseline review](ui-verification.md#review-visual-changes);
CI never accepts new screenshots automatically.

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
