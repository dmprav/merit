# Run background work on Temporal

`@merit/workflows` owns Merit's connection to [Temporal](../../docs/decisions/0016-temporal-background-work.md):
configuration, the workflow client, the payload encryption codec, worker creation with
connection retry, and test helpers. It depends on no capability. Each capability defines
the workflows and activities for the work it owns; [application assembly](../../app/src/worker/main.ts)
builds the worker and registers them. PostgreSQL stays the record of what must happen;
Temporal starts, retries, and resumes that work.

## Configure the connection

Call `readTemporalConfig(env, { local })` from host wiring, which owns reading the
environment, and pass the result to the client and worker.

| Setting                | Local default    | Elsewhere | Purpose                                                    |
| ---------------------- | ---------------- | --------- | ---------------------------------------------------------- |
| `TEMPORAL_ADDRESS`     | `127.0.0.1:7233` | Required  | `host:port` of the Temporal frontend.                      |
| `TEMPORAL_NAMESPACE`   | `default`        | `default` | Namespace for workflows and task queues.                   |
| `TEMPORAL_API_KEY`     | Unset            | Optional  | Credential for a hosted service. Setting it turns on TLS.  |
| `TEMPORAL_PAYLOAD_KEY` | Development key  | Required  | Base64 AES-256 key that encrypts every payload (32 bytes). |

`local` is true only for development and preview. The development payload key is
published in the repository and protects nothing; a deployment without its own key
fails to start. Errors name the invalid setting and never its value. Generate a key
with `openssl rand -base64 32`.

## Keep payloads small and encrypted

Workflow inputs and activity results carry record identifiers only; activities read
everything else from PostgreSQL under current permissions. The one exception, the raw
organization-invitation token, travels only inside an encrypted payload.

`createDataConverter` (worker) and `createClientDataConverter` (client) apply a codec to
every payload the client and worker exchange with the server. Each payload, metadata
included, is encrypted with AES-256-GCM under a fresh nonce, so the server and its history
store only the `binary/encrypted` encoding. The codec rejects payloads that are not
encrypted. Failures are covered too: the failure converter moves error messages and stack
traces into encoded attributes, which the codec then encrypts, so history keeps only
"Encoded failure" in plaintext. The worker names the converter by path
(`failureConverterPath`) because workflow code converts failures inside its sandbox. The
Temporal UI therefore shows ciphertext. Rotating the key makes history written under the old key unreadable; plan
a key-identifier scheme before the first rotation.

## Start workflows

`createWorkflowClient(config)` returns a client whose connection opens on first use, so
creating it never fails when Temporal is down. Start a workflow after the business
change commits, with an ID derived from the committed record so that starting twice
cannot duplicate the work. A failed start reports the outage to its caller; the commit
stands.

Application code reaches this through `@merit/workflows/client`, which never loads the
worker's native module (the web server bundle must not). `createWorkflowStarter({ client,
taskQueue, report })` returns `start(request)`, the one way to start after commit:

- the ID is the caller's, derived from the record; a run that already exists is a no-op
  (`"exists"`), and `signal` turns the call into signal-with-start for a long-lived workflow;
- by default a completed run of the same ID is left alone and a failed one may run again, so a
  reconciler never repeats finished work; `closed: "restart"` lets a request run it again;
- it never throws. A start that fails or takes longer than five seconds is passed to `report`
  by its operation name only, and answers `"failed"`. The commit stands and reconciliation starts
  the work later. `client` is a function, so missing settings fail there, reported, not at startup.

## Wait briefly for the first outcome

`waitForOutcome(read, { timeoutMs, intervalMs })` polls Postgres, not Temporal, so a request can
answer with what the work did in its first seconds. `read` returns `undefined` while unfinished;
the wait returns `undefined` when it ends, and the caller reports `pending`. The defaults are
five seconds and 100 ms; services take them as dependencies so tests inject short ones.

## Reconcile committed work

`ensureSchedule(client, settings)` creates a Schedule or updates the existing one in place,
keeping its paused state, so every worker start can call it. The application worker ensures
`merit-reconcile`, which runs the `reconcile` workflow every minute. The workflow runs a list of
reconcilers, one activity each, that list committed unfinished work in Postgres and start the
workflows that are missing. Add a reconciler to
[`reconcile.workflow.ts`](../../app/src/worker/reconcile.workflow.ts) and its activity to
[`activities.ts`](../../app/src/worker/activities.ts).

## Write workflow modules

Workflow code replays deterministically inside Temporal's sandbox. Name each workflow
module `*.workflow.ts`. The [architecture checks](../../docs/guides/architecture-checks.md)
let these files import only `@temporalio/workflow`, other workflow modules, type-only
imports such as an activities module's types, and pure code (`domain/`, `contracts/`).
They reject `node:*`, npm packages, `@merit/db`, and capability `server` entries. Keep
activities, which can use Node.js and the database, in modules that workflow code
imports only for types. Re-export every workflow from one entry module, such as the
app's [`workflows.workflow.ts`](../../app/src/worker/workflows.workflow.ts), and pass its
path as `workflows.workflowsPath`.

## Run a worker

`runWorker(settings, { logger, signal })` connects with exponential backoff (1 s to 30 s)
while Temporal is unreachable, logs each attempt without credentials, then polls until the
signal aborts and in-flight work finishes. Failing to build the worker, for example from
invalid workflow code, rejects instead of retrying. `createWorker` builds a worker over a
connection you own.

The application worker is [`app/src/worker/main.ts`](../../app/src/worker/main.ts). It
registers `workerHealth`, which proves the path from client to worker, activity, and result;
and `reconcile`. Each capability adds the workflows for the work it owns. The process exits once the worker stops, with a non-zero code when
the worker failed. Run it with `vp run @merit/app#worker`, or let
[`vp run dev`](../../docs/guides/development.md#start-and-seed-postgresql) start it.

## Test against the Compose server

Tests never download a Temporal server. Start the Compose service with
`docker compose up -d --wait`, then use `@merit/workflows/testing`:

- `readTestTemporalConfig(process.env)` reads the local settings;
- `startTestWorker(config, { workflows, activities })` runs a worker on a unique task queue
  and returns a client and `stop()`;
- `uniqueName(prefix)` makes workflow IDs that cannot collide;
- `readStoredPayloads` and `readStoredFailures` return the payloads and failures exactly as
  the server stored them, `storedHistoryIncludes` searches the stored history for a probe
  string, and `createClientWithPayloadKey` builds a client with another key to prove they
  are unreadable. Close that client's `connection` when the test ends.

Put tests that need Temporal in the integration suite, as the
[worker integration test](../../app/tests/worker.integration.ts) does. Unit tests cover
configuration, the codec, and worker orchestration without a server. Use short timeouts in
tests, and end every test's work before stopping its worker.

## Worker logs

`quietRuntime` installs the SDK Runtime logger once per process with a format that keeps the level,
a short fixed message, and identifiers (workflow type and ID, activity type, task queue, attempt,
duration). Failure messages, stack traces and task tokens are never printed, because a failure can
carry what the encrypted history protects. `runWorker` accepts `onConnected` for start-up work that
needs a reachable server, such as `ensureSchedule`.

## Telemetry

Temporal interceptors for OpenTelemetry are not installed. `@temporalio/interceptors-opentelemetry`
depends on OpenTelemetry 1.x packages, while Merit's [telemetry](../telemetry/README.md) uses
the 3.x line. Add the interceptors when the versions align or a second copy is acceptable.
