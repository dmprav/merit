# Deploy Merit

The public site, product, admin interface, and MCP share one origin. One Linux
host can run the [Node.js release image](../../Dockerfile) as two separate
containers, one for HTTP and one for the Temporal worker. An nginx container
keeps a stable listener while the two release slots alternate.

## Rehearse a release locally

With a BuildKit-enabled Docker Engine, Compose, Python 3.9 or later, and the repository's Node
dependencies installed, run these commands from the repository root:

```sh
docker compose up -d --wait
docker build -t merit:local .
vpx app/tests/overlapping-deploy.ts merit:local
```

The rehearsal creates an isolated PostgreSQL database and restricted login, uses
unique Temporal queues and a Schedule, and captures invitation email in Mailpit. Only the email-capture release uses the
local worker setting.
It derives two images with different public files from the supplied release.
It samples container memory while both slots are running, continuously requests
the rendered home page, rejects an unhealthy candidate,
holds a 32 MiB response open across the switch, and checks that an old client
asset still loads. An invitation saved before dispatch must arrive once and its
link must work. Finally it rolls back and executes a workflow on the restored
worker. The command removes its containers, test images, database, login,
Schedule, and release state on exit.

## Run overlapping releases on one host

Build an image for the host's architecture and keep a tag or digest for each
release. Supply public client settings such as `VITE_CLERK_PUBLISHABLE_KEY` at
build time with Docker build arguments. Keep database credentials, Temporal and
provider secrets in a mode-0600 Docker env file outside the build context.
Use the same `APP_ORIGIN`, payload key, namespace, and task queues in both slots.

Apply any schema changes with the migration credential before switching. The
old and new processes share the database and Temporal history during a deploy.
Schema changes, activities, and workflow code must work with both versions
through the rollback window. Create the Docker network once before the first release.

```sh
docker network create merit-services
export MERIT_DEPLOY_NETWORK=merit-services
export MERIT_DEPLOY_STATE=/var/lib/merit/release
export MERIT_DEPLOY_PORT=8080
tooling/deploy/release.py merit:release-a /etc/merit/runtime.env
tooling/deploy/release.py merit:release-b /etc/merit/runtime.env
# Roll back using the retained image and its compatible configuration.
tooling/deploy/release.py merit:release-a /etc/merit/runtime.env
```

The [release command](../../tooling/deploy/release.py) starts the new web and
worker, checks each container's readiness, and validates the nginx configuration
before switching new requests. When the old nginx worker finishes its requests,
the driver sends SIGTERM to the retired processes and waits for them to exit.
The active release continues serving if candidate readiness fails. If the new
route fails verification after the switch, the driver restores the last confirmed
configuration before removing the candidate. Rerun with
the same state directory after an interrupted command. Budget memory and
database connections for both slots, plus nginx, during the overlap. A local Linux ARM64 rehearsal measured 2.14 GiB across the two
web servers, two workers, and nginx while the download was in flight. That
sample excludes Docker, the host OS, PostgreSQL, and Temporal. Retain
the state directory across releases and host restarts. Its client asset
directory grows with new content hashes so already-open tabs can load their
original assets.

The listener binds to `127.0.0.1`. Before exposing a public origin, configure
TLS and verify that the ingress sees the browser's actual IP for rate limiting.
An additional TLS proxy changes the socket peer seen by nginx and requires an
explicit trusted-proxy configuration. Verify HTTPS headers, streaming, and
client-IP handling at that boundary. This rehearsal exercises deploys while the
single host and its dependencies stay available.

## Build and preview

To exercise the built application locally, start the Compose services, apply
the migrations, then start Vite preview:

```sh
docker compose up -d --wait
vp run @merit/db#db:migrate
vp run @merit/app#build
vp run @merit/app#preview
```

The preview task selects `MERIT_LOCAL_PREVIEW=1`, binds to loopback, and starts the
[application worker](../../app/src/worker/main.ts) beside the web server. This runs
the production build with local database and HTTP origin defaults. For a deployment,
leave the preview setting unset and supply both `DATABASE_URL` and an HTTPS
`APP_ORIGIN`. The server validates these when loading its entry point. Demo cookies
and server-function origin checks use that public origin through TLS termination.

Open [localhost:3000](http://localhost:3000). With the preview running, use
`vp run @merit/app#smoke` in a second terminal to check public pages and
signed-out access. See [verification](verification.md#verification) for the
full set of checks.

## Prepare private file storage

Set up a dedicated private S3-compatible bucket and server credentials before
using file operations. The [storage guide](../../foundation/storage/README.md#configure-a-bucket)
covers provider requirements, environment settings, and coordination with attachment owners during cleanup.

## Prepare background work

Merit's background work runs on [Temporal](../decisions/0016-temporal-background-work.md).
The packaged worker can connect to local Temporal or Temporal Cloud using the same queues.

- **A Temporal service** reachable from both the web server and the worker. Set
  `TEMPORAL_ADDRESS` (`host:port` of the frontend) and `TEMPORAL_NAMESPACE` for the namespace
  that holds Merit's workflows. A hosted service also needs `TEMPORAL_API_KEY`, which turns on
  TLS. A deployment must set the address, which has no deployed default; the namespace defaults to `default`.
- **A payload key.** Set `TEMPORAL_PAYLOAD_KEY` to a base64-encoded 32-byte key
  (`openssl rand -base64 32`) in the web server and worker environments. They must share it.
  The development key is public, so a deployment without its own key refuses to start. Keep
  the key in the secret store. Rotation must account for both retained workflow history and
  pending organization-invitation handoffs encrypted with the old key.
- **A worker process.** Start the release image with the `worker` command, as the one-host deploy does,
  with the same environment as the web server, without `MERIT_LOCAL_WORKER`. It needs outbound
  access to Temporal and, once capabilities register workflows, to the database and other
  services their activities use. Stop it with `SIGTERM` so it finishes work in flight.

## Prepare the database

### First-time provisioning

Create an empty database on a managed PostgreSQL host, with separate credentials
for migrations and the running application. Apply the migrations and configure
runtime privileges using the steps below.

Set the Node server's `DATABASE_URL` to the application credential. The server
shares a PostgreSQL connection pool across requests. Keep the migration
credential separate.

After publishing, use the [organization administration app](organizations.md) to
create workspaces and invite their first owners. Configure an operator
and the Resend sender before onboarding. Publishing the application alone does not
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

Workspace search needs the `pg_trgm` and `unaccent` extensions, which the migrations
create in the `public` schema. PostgreSQL 13 and later treat both as trusted, so the
migration credential only needs `CREATE` on the database; on a managed host that
restricts extensions, enable them there first. The runtime credential needs nothing
beyond the table privileges below, since the extensions' functions are executable by
every role.

### Check runtime privileges

Use a dedicated login with `NOSUPERUSER` and `NOBYPASSRLS`. The migration
credential owns the tables and policy functions. Keep the runtime outside the
owner role and grant it database `CONNECT`. Apply the
[runtime grants](../../foundation/db/database/runtime-grants.sql) after migration
using the actual runtime role name, for example:

```sh
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -v runtime_role=merit_runtime -f foundation/db/database/runtime-grants.sql
```

New application pool connections verify that row security applies to every public
table except the global identity, access-request and rate-limit tables. The local
Compose migration provisions the separate `merit_runtime` login automatically.
The [access contract](../../capabilities/access/README.md#isolate-a-workspace-operation)
explains transaction scope, action checks and the isolation tests.

Personal navigation pins require reads, insertion, reordering, and removal. The
[navigation integration tests](../../capabilities/grantmaking/business/tests/navigation.integration.ts)
check these operations with restricted runtime grants.

Application and round creation receipts and reviewer command receipts do not carry
audit payloads.
Grant `INSERT` on `audit_events` for audited writes and `SELECT` for every history
view, including the Activity page and its MCP tool. A missing `INSERT` grant fails the entire save. Audit events reject updates; deletion is restricted to expired
demos and the cleanup operator requires `DELETE` on `audit_events`. The
[audit capability guide](../../capabilities/audit/business/README.md) explains its
recording and retention contract.
Public access requests use the two `access_request` tables and their listed runtime
grants. The application uses the Node socket peer address for rate limiting; local development uses a shared
local bucket. Missing production address information fails closed.

Application intake updates the funder's case and appends material versions when
recorded content changes. Working revisions use `material_drafts`; review requests
have mutable completion state, while received assessments and recommendations
append versions. Reads compose these records, so the runtime needs `SELECT` on
all the listed grantmaking tables even for operations that write only one of them.

Recorded material, criteria, assessment, and recommendation versions reject
updates and direct deletion while their owner exists. Grant the runtime `SELECT` and `INSERT`, with
no direct version deletion. Deleting an eligible case or empty round removes its
owned version records through foreign-key cascades; the business operations check
eligibility first. Case and round audit records remain after those deletions, and
the runtime does not need to update or delete them. Operator cleanup separately
owns deletion of disposable demo history.

Contacts require profile reads and writes. The [contact and review integration tests](../../capabilities/grantmaking/business/tests/reviews.integration.ts)
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

The demo uses the same server and database as normal workspaces. Apply all migrations
before publishing. The runtime additionally needs `SELECT`, `INSERT`, and `UPDATE`
on `guest_sessions` and `demo_entry_limits`, and `UPDATE (demo_expires_at)` on
`organizations`. Account mapping may create an `app_users` row before invitation
acceptance; disabled users remain disabled. Prepared fictional history has an inactive
credential-free author. Ordinary grant/history privileges also cover demo seeding.

Web and MCP share an allowance of forty demo starts or resets per network address
per hour, stored in short-lived hashed buckets. Both return `unavailable` when the
production adapter supplies no address. Resume reads do not consume this allowance.
Keep application responses private and uncached. Cookie possession establishes
identity, while membership and expiry checks
continue to protect every operation.

Run `vp run @merit/app#demo:cleanup` regularly with an operator `DATABASE_URL`.
It removes expired demo content in bounded transactions and then expired guest
identities with no remaining membership. Use a dedicated maintenance credential with row-security bypass and the required
table privileges for cleanup of expired workspaces and guest identities; do not grant blanket audit deletion to the web runtime.
Expiry denies access independently of cleanup. Standard workspaces and account
users are never removed by this command.

## Configure identity and the public address

Use a Clerk application configured for the deployed site. Set these values in
the Node process environment:

| Setting                 | Value                                    |
| ----------------------- | ---------------------------------------- |
| `APP_ORIGIN`            | The site's HTTPS origin.                 |
| `CLERK_PUBLISHABLE_KEY` | The Clerk application's publishable key. |
| `CLERK_ISSUER`          | Its HTTPS Frontend API URL.              |

Supply `CLERK_SECRET_KEY` and `RESEND_API_KEY` through the server environment.
Use the same publishable key as `VITE_CLERK_PUBLISHABLE_KEY` when building the web
application. Configure the deployed `/mcp/workspace` URL in Clerk using the
[MCP authentication setup](mcp-operations.md#configure-workspace-authentication).

To enable browser and server product analytics, set `VITE_POSTHOG_KEY` to the
PostHog project token during the build. The ingest host defaults to the EU. Set
`VITE_POSTHOG_HOST` for a US or custom endpoint. A blank key disables both
adapters. Use the staging project token for a staging build.

After configuring a token, save a changed recommendation in a test workspace
through the web, then save another change through MCP. In PostHog, look for two
`funding_recommendation_saved` events with different surfaces. An invited
workspace should have the same `workspace_key` on both. A demo should have
`workspace_kind = demo` and omit the key. A rejected recommendation call should
produce only `mcp_tool_finished`. The [analytics contract](../../foundation/analytics/README.md)
defines the events and how to count repeat use.

## Verify a future deployment

Verify client assets, server-side rendering, and the shared origin for web and MCP.
The packaged HTTP adapter accepts forwarding headers from the exact nginx peer
address supplied by the release command. nginx overwrites client-supplied
forwarding headers with the address of its socket peer. Before
launch, verify through that ingress that two distinct client addresses receive
separate allowances and that changing a client-supplied forwarding header leaves
the allowance unchanged.

Set `MERIT_BASE_URL` to the deployed origin and run `vp run @merit/app#smoke`.
It checks public pages, 404 recovery, and workspace MCP authentication. It also verifies
that signed-out requests expose no workspace data. Check live Clerk sign-in and protected MCP separately with a
provisioned user: the permitted workspace should load and other organizations
should remain inaccessible. In a workspace with fictional data, save a manager
recommendation and reload the page to verify that the change persists through
the deployed server's runtime credentials.

## Verify HTTP security headers

The server applies MIME sniffing protection, a default referrer policy, and
browser restrictions for camera, microphone, and geolocation. Invitation and
reviewer links keep their stricter `no-referrer` policy. The enforced Content
Security Policy (CSP) disallows framing, plugins, and document base URLs.

When the public origin uses HTTPS, the application sends one year of HSTS.
Configure the TLS ingress to serve HSTS on all HTTPS responses, including
static assets, redirects, and errors that bypass the application. Preserve the
application's route-specific headers and serve each nonce-bearing HTML response
without shared caching.

HTTPS HTML also carries a report-only CSP. The server generates a fresh nonce
for TanStack's hydration scripts and includes the configured Clerk and analytics
origins in the relevant directives. Before enforcing this policy, inspect
browser CSP violations while loading a public page, completing Clerk sign-in,
navigating a workspace, and delivering a staging PostHog event. Chromium reports
string evaluation in the client schema bundle under this policy. Verify schema
validation and its CSP-compatible fallback before enforcement. Use the browser
developer tools or configure the `merit-csp` Reporting API group at ingress to
send reports to an approved destination. Reports can include sensitive page URLs.
Once those checks pass on the deployed origin, promote the verified candidate
to the enforced header while retaining the per-response nonce.

## Configure tracing and synthetic checks

Trace export is disabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty. To export
OpenTelemetry spans from Node.js to Checkly (or another OTLP/HTTP collector),
set these server environment variables:

| Setting                       | Value                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | Service identifier recorded on spans (defaults to `merit`).                         |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector HTTPS URL (HTTP is accepted on loopback). Use the final ingestion URL.    |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Server secret with comma-separated `key=value` headers (for example API auth).      |
| `OTEL_TRACE_FILTER`           | `checkly` (default, caps Checkly-marked requests) or `all` (exports every request). |

In `checkly` mode, each server process samples up to ten marked requests in a
rolling minute. The marker is a correlation hint anyone can send. Requests
share the budget across routes and callers, so a busy minute can leave a check
without a trace. Child spans follow their request's decision. The exporter
rejects redirects.

Synthetic checks live in [`tooling/checkly`](../../tooling/checkly/README.md). Set
`MERIT_BASE_URL` to your target origin and run `vp run @merit/checkly#test:synthetic` to
verify checks against Checkly or `vp run @merit/checkly#deploy` to sync schedules.
