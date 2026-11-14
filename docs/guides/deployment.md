# Deploy Merit

The public site, product, operator admin interface, and MCP deploy together as one
Cloudflare Worker assembled by `@merit/app`. The application configuration is in [`app/cloudflare.config.ts`](../../app/cloudflare.config.ts).
Run commands from the repository root. For a first deployment, provision the
database and identity service below. For later deployments, reuse those services,
[apply pending migrations](#apply-migrations) and
[check runtime privileges](#check-runtime-privileges), then publish and verify.

## Build and preview

Verify the application with local PostgreSQL and Mailpit before configuring the
production services. Complete the [verification setup](verification.md#verification),
including browser installation, then run:

```sh
docker compose up -d --wait
vp run ready
vp run @merit/app#preview
```

With the preview running, use `vp run @merit/app#smoke`. Set `MERIT_BASE_URL` if
the preview uses another port. See [verification](verification.md#verification)
for targeted checks.

## Prepare the database

### First-time provisioning

Create an empty database on a managed PostgreSQL host, with separate credentials
for migrations and the running application. Apply the migrations and configure
runtime privileges using the steps below.

Create a [Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/get-started/)
using the application credential and replace the placeholder `HYPERDRIVE` binding
ID in the application configuration. Disable [query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/):
writes do not invalidate cached reads, and access checks and reads after changes
need current data. Connection pooling remains useful with caching disabled.

After publishing, use the [organization administration app](organizations.md) to
create workspaces and invite their first owners. Configure an operator
and the Resend sender before onboarding. Publishing the Worker alone does not
create memberships; the example seed task remains limited to local databases.

### Apply migrations

For a new database or pending schema changes on an existing deployment, set
`DATABASE_URL` to the database's direct connection URL with the migration
credential, then run:

```sh
vp run @merit/db#db:migrate
```

The migrations create the complete current schema. Use an empty database
for the first deployment. Prototype databases must be recreated; they have no
upgrade path to this baseline, even if their migration used the same filename.
The [local reset procedure](development.md#local-database-recovery) applies only
to disposable Compose databases.

### Check runtime privileges

After applying migrations, check the runtime role's grants on both new and
existing deployments. With an administrative credential, grant database `CONNECT`,
schema `public` `USAGE`, and any missing table privileges:

| Tables                                                                                                    | Privileges                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `app_users`, `memberships`, `organizations`                                                               | `SELECT`                                                            |
| `funding_rounds`, `application_cases`, `material_drafts`                                                  | `SELECT`, `INSERT`, `UPDATE`, `DELETE`                              |
| `material_versions`, `criteria_versions`, `assessment_versions`, `recommendation_versions`, `assessments` | `INSERT`                                                            |
| `review_assignments`, `reviewer_drafts`, `reviewer_messages`                                              | `SELECT`, `INSERT`, `UPDATE`                                        |
| `grant_navigation_pins`                                                                                   | `SELECT`, `INSERT`, `UPDATE`, `DELETE`                              |
| `review_states`, `review_requests`                                                                        | `SELECT`, `INSERT`, `UPDATE`                                        |
| `memberships`                                                                                             | `UPDATE (user_id, role, administration, version)`, `DELETE`         |
| `app_users`                                                                                               | `UPDATE (id, name)`                                                 |
| `organizations`, `app_users`, `memberships`, `organization_invitations`                                   | `INSERT`                                                            |
| `organization_invitations`                                                                                | `SELECT`, `UPDATE (revoked_at, accepted_at, accepted_by, delivery)` |
| `organizations`                                                                                           | `UPDATE (name)`                                                     |
| `contacts`                                                                                                | `SELECT`, `INSERT`, `UPDATE`                                        |
| `application_creation_receipts`, `round_creation_receipts`, `reviewer_command_receipts`                   | `SELECT`, `INSERT`                                                  |
| `audit_events`                                                                                            | `SELECT`, `INSERT`                                                  |
| `access_requests`                                                                                         | `SELECT`, `INSERT`, `UPDATE (reviewed_at, reviewed_by)`             |
| `access_request_limits`                                                                                   | `SELECT`, `INSERT`, `UPDATE`, `DELETE`                              |

Personal navigation pins require reads, insertion, reordering, and removal. The
[navigation integration tests](../../capabilities/grantmaking/business/tests/navigation.integration.ts)
check these operations with restricted runtime grants.

Review revisions live in `review_states`; recommendation revisions belong to
`recommendation_versions`. Application cases own only their intake revision.

All audit history views read `audit_events`. Application and round creation receipts
and reviewer command receipts require `SELECT` and `INSERT`; they do not carry
audit payloads.
Grant `INSERT` on `audit_events` for audited writes and `SELECT` for every history
view, including the Activity page and its MCP tool. A missing `INSERT` grant fails the entire save. Audit events reject updates; deletion is restricted to expired
demos and the cleanup operator requires `DELETE` on `audit_events`. The
[audit capability guide](../../capabilities/audit/business/README.md) explains its
recording and retention contract.
Public access requests use the two `access_request` tables and their listed runtime
grants. The application uses Cloudflare's
trusted client-address header for rate limiting; local development uses a shared
local bucket. Missing production address information fails closed.

Application intake updates the funder's case and appends material versions when
recorded content changes. Working revisions use `material_drafts`; review requests
have mutable completion state, while received assessments and recommendations
append versions. Reads compose these records, so the runtime needs `SELECT` on
all the listed grantmaking tables even for operations that write only one of them.

Reviewer assignments retain private drafts with their application. Assignment events
are append-only, and assessment authorship cannot be changed after creation. Email
records retain pending, failed, or sender-accepted status; managers can resend
invitations or retry a failed submission notification. Configure the existing
email sender and application origin before inviting reviewers.

Recorded material, criteria, assessment, and recommendation versions reject
updates and direct deletion while their owner exists. Grant the runtime `SELECT` and `INSERT`, with
no direct version deletion. Deleting an eligible case or empty round removes its
owned version records through foreign-key cascades; the business operations check
eligibility first. Case and round audit records remain after those deletions, and
the runtime does not need to update or delete them. Operator cleanup separately
owns deletion of disposable demo history.

Contacts require profile reads and writes plus append-only history. Profile edits
are resolved on linked application reads without rewriting material versions or
case history. The [contact and review integration tests](../../capabilities/grantmaking/business/tests/reviews.integration.ts)
exercise those operations with restricted runtime grants.

PostgreSQL row locks also require `UPDATE` privileges on the locked round, case,
organization, user, and membership rows. Retain the listed identifier-column
privileges when using narrower update grants. A lock does not itself change those
identifiers, but the grants are actual update privileges, not lock-only permissions.
The [recommendation tests](../../capabilities/grantmaking/business/tests/recommendations.integration.ts)
verify these locks and append-only recommendation writes. The
[round preparation tests](../../capabilities/grantmaking/business/tests/round-preparation.integration.ts)
verify creation, budget edits, history reads, deletion, and safe retries with a
restricted role. The [ownership tests](../../capabilities/grantmaking/business/tests/grantmaking-write.integration.ts)
verify immutable versions, review bases, and organization-scoped contact links.
The
[organization integration tests](../../capabilities/organizations/business/tests/organizations.integration.ts)
exercise provisioning with the additional grants. Organization provisioning additionally
inserts users and memberships, updates names and invitation state, and appends
organization events. Invitation acceptance locks the organization and user rows;
retain the listed column-level update grants. Team management updates membership
attributes and deletes membership rows on removal, while preserving users and
audit records. Acceptance stores the verified contact email and display name.

## Operate demo workspaces

The demo uses the same Worker and database as normal workspaces. Apply all migrations
before publishing. The runtime additionally needs `SELECT`, `INSERT`, and `UPDATE`
on `guest_sessions` and `demo_entry_limits`, and `UPDATE (demo_expires_at)` on
`organizations`. Account mapping may create an `app_users` row before invitation
acceptance; disabled users remain disabled. Prepared fictional history has an inactive
credential-free author. Ordinary grant/history privileges also cover demo seeding.

Provisioning is limited to forty start/reset requests per network address per hour,
using Cloudflare's trusted client-address header and short-lived hashed buckets.
Resume reads do not consume this allowance. Keep application responses private and
uncached; cookie possession establishes identity, while membership and expiry checks
continue to protect every operation.

Run `vp run @merit/app#demo:cleanup` regularly with an operator `DATABASE_URL`.
It removes expired demo content in bounded transactions and then expired guest
identities with no remaining membership. Give that operator the required deletes on
demo content and history; do not grant blanket audit deletion to the web runtime.
Expiry denies access independently of cleanup. Standard workspaces and account
users are never removed by this command.

## Configure identity and the public address

Use a Clerk application configured for the deployed site. Set these values for
the Worker in the application configuration:

| Setting                 | Value                                    |
| ----------------------- | ---------------------------------------- |
| `APP_ORIGIN`            | The site's HTTPS origin.                 |
| `CLERK_PUBLISHABLE_KEY` | The Clerk application's publishable key. |
| `CLERK_ISSUER`          | Its HTTPS Frontend API URL.              |

Supply `CLERK_SECRET_KEY` through Cloudflare or a `cf deploy --secrets-file` input.
Use the same publishable key as `VITE_CLERK_PUBLISHABLE_KEY` when building the web
application. Configure the deployed `/mcp/workspace` URL in Clerk using the
[MCP authentication setup](mcp-operations.md#configure-workspace-authentication).

## Publish and verify

Sign in with `cf auth login` or supply `CLOUDFLARE_API_TOKEN`. With the production
configuration and build variables set, you can inspect the bundle before
publishing: run `vp run @merit/app#build`, then:

```sh
vp exec --filter @merit/app cf deploy --prebuilt --mode production --dry-run
```

Publish with the deployment task, which builds and deploys the application:

```sh
vp run @merit/app#deploy
```

Set `MERIT_BASE_URL` to the deployed origin and run `vp run @merit/app#smoke`.
It checks the public pages, removal of anonymous MCP, and that signed-out requests expose
no workspace data. Check live Clerk sign-in and protected MCP separately with a
provisioned user: the permitted workspace should load and other organizations
should remain inaccessible. In a workspace with fictional data, save a manager
recommendation and reload the page to verify that the change persists through
the deployed Worker's runtime credentials.

## Configure tracing and synthetic checks

Trace export is disabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty. To export
OpenTelemetry spans from Cloudflare Workers to Checkly (or another OTLP/HTTP collector),
set these Worker settings in [`app/cloudflare.config.ts`](../../app/cloudflare.config.ts)
and secrets:

| Setting                       | Value                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | Service identifier recorded on spans (defaults to `merit`).                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL (for example Checkly's regional OTLP ingestion URL).                 |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Worker secret with comma-separated `key=value` headers (for example API auth).          |
| `OTEL_TRACE_FILTER`           | `checkly` (default, exports only Checkly-traced runs) or `all` (exports every request). |

Synthetic checks live in [`tooling/checkly`](../../tooling/checkly/README.md). Set
`MERIT_BASE_URL` to your target origin and run `vp run @merit/checkly#test` to
verify checks against Checkly or `vp run @merit/checkly#deploy` to sync schedules.
