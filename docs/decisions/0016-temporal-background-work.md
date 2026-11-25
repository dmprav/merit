# Run background work on Temporal

Accepted 25 November 2026. Local development comes first; production hosting
remains open under the [Node.js runtime decision](0003-node-runtime.md).

Merit runs its background work as [Temporal](https://temporal.io/) workflows:
reviewer invitation and submission emails, organization invitation emails, and
[Merit AI](0015-merit-ai-assistant.md) turns. PostgreSQL remains the record of
what must happen. Temporal makes sure that work starts, retries it within stated
limits, and resumes it after a restart.

## Reasons

Learning durable execution is an explicit objective of this
[portfolio and learning project](../foundations/strategy.md#current-purpose-and-working-context).
The adoption also closes a real recovery gap. Emails are sent inside the request
after their record commits, so a process that stops between commit and send
leaves a message pending with nothing to resume it. Merit AI turns rely on an
in-process scheduler that scans PostgreSQL every ten seconds and coordinates
with time-limited claims. One mechanism replaces both, and the longer-running
document processing anticipated by the runtime decision can build on it.

## Keep PostgreSQL the source of truth

Business changes and their audit records still commit together before any work
starts. Workflows start after commit with an identifier derived from the
committed record, such as the message, invitation, or turn ID, so starting the
same work twice cannot duplicate it. A reconciliation pass starts workflows for
committed work that has none. When Temporal is unavailable, requests still
commit, and their work starts once it returns.

Activities read current facts, recheck authority and state, and record outcomes
through the existing guards: delivery tokens, revisions, and the email provider's
idempotency key. Send limits, approvals, stopping a turn, watching committed
snapshots, and workspace consent keep their current meaning.

## Retry deliveries for a bounded time

A failed email send retries with backoff for about fifteen minutes, and the
message shows as retrying meanwhile. It is then marked failed, and the existing
manual retry and resend actions remain available. Invitation expiry is checked
before each attempt.

## Keep confidential material out of workflow history

Workflow inputs and activity results contain record identifiers only. Activities
read everything else from PostgreSQL under current permissions. The sole
exception is the raw organization-invitation token, which exists only until its
email is sent; it travels in a payload encrypted with a server-held key. Grant
content, email addresses, rendered messages, and AI conversations never enter
Temporal history.

## Ownership and local runtime

A technical `foundation/workflows` package owns the connection, client,
encryption codec, telemetry interceptors, and test helpers, independent of
capabilities. Each capability defines the workflows and activities for the work
it owns; application assembly builds the worker and binds activities to
authorized services with an explicit actor. Workflow code stays deterministic,
and architecture checks prevent it from importing Node.js APIs, the database, or
capability server entries.

Locally, Docker Compose runs the Temporal development server beside PostgreSQL,
and the worker runs as its own Node.js process, started by the development and
preview commands. There is no in-process fallback, so local development exercises
the only execution path.

## Costs and reasons to reconsider

Merit takes on another service and process, a native SDK module, determinism
rules for workflow code, versioning when changing workflows that are still
running, and a second place to look when diagnosing stuck work. A deployment
needs a Temporal service, either hosted or self-managed, plus a worker; choose it
with the hosting provider.

Reconsider if the SDK cannot support Merit's Node.js versions or build setup, or
if the operating cost outweighs what the project learns once hosting is chosen.
A PostgreSQL-backed queue with the same commit-first and reconciliation rules is
the fallback.
