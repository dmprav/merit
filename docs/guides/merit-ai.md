# Connect a client to the Merit AI backend

Merit AI runs a conversation for its owner in one workspace. The app server
authenticates the existing web session, selects tools for the person's current
authority, and stores the conversation in PostgreSQL. The
[assistant decision](../decisions/0015-merit-ai-assistant.md) explains approvals,
evidence, retention, and access loss.

The backend exposes the existing grant-work tools for the person's role.
Workspace discovery returns the conversation's workspace. The account-level
`start_demo` operation stays in onboarding and MCP because it creates a separate
workspace.

## Enable the model

Apply the [database migrations and runtime grants](deployment.md#prepare-the-database).
Set `OPENAI_API_KEY` on the server and set `MERIT_AI_MODEL` to a model available
to that account that supports function calling through Chat Completions. Restart
the app server. Keep the server running to process queued work. The worker
discovers unfinished turns after a restart.

In each workspace, read `settings` to show the configured provider and model to
an organization administrator or owner. Send `set_consent` with `enabled: true`
after opt-in. Set it to false to turn off provider access for that workspace.
Turning consent off blocks new conversation turns and new
[AI reviews](#run-ai-reviews) only. Saved AI reviews stay readable, because
the material was shared while consent was on. The product has no consent settings
screen yet, so `set_consent` is how an owner or administrator changes it.
The public demo panel continues to use recorded conversations.

## Run AI reviews

The same server settings, `OPENAI_API_KEY` and `MERIT_AI_MODEL`, and the same
workspace consent enable an
[AI review](../workflows/review-applications.md#ask-merit-ai-for-another-perspective)
of an application. It is a single request rather than a conversation: the server
asks Chat Completions for a strict JSON schema reply (`response_format` with
`json_schema` and `strict: true`), with provider storage disabled and a 90 second
limit. The business package validates the reply with Zod, and every cited quote
must appear in the field it names, before anything is saved. Any provider error,
timeout, malformed reply or unverifiable citation saves nothing.

The assistant offers `run_ai_review` as a write. Its preview names the application
and version, the provider and model, the effect "Sends this application's current
material and the round's criteria to the provider", and "Saves a new AI review".
Results of `read_ai_reviews` are cited with the evidence kind `ai_review`, never
as application material. Reviewer members do not receive either tool.

## Use the endpoint

Send a JSON object to `POST /api/assistant/{workspaceSlug}` with the
authenticated web session, a matching `Origin`, and
`Content-Type: application/json`. For example, from the application origin:

```js
const response = await fetch("/api/assistant/alder", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "create" }),
});
const conversation = await response.json();
```

| Action               | Additional fields                | Result                                                                           |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `settings`           |                                  | Configured provider, model, and workspace consent                                |
| `set_consent`        | `enabled`                        | Updated settings                                                                 |
| `create`, `list`     |                                  | New private conversation or the owner's accessible conversations                 |
| `start`              | `id`, `message`, optional `page` | Accepted turn. The optional page is a path inside the same workspace.            |
| `open`, `watch`      | `id`                             | Current snapshot or a stream of committed snapshots                              |
| `evidence`           | `id`, `key`                      | Saved source observations for a citation such as `E1`, subject to current access |
| `approve`, `decline` | `id`, `previewId`                | Decision about the exact preview group                                           |
| `retry`              | `id`, `previewId`, `actionId`    | Retry one eligible failed action                                                 |
| `stop`, `delete`     | `id`                             | Stop further work or delete the conversation                                     |

Use the server-issued group ID for `previewId`. Show each action's targets,
proposed changes, and external effects before asking for approval. Display the
progress and individual outcomes from the returned snapshot. A conflict calls
for reopening the conversation so the person can review the current proposal.

`watch` responds with `text/event-stream`. Each `conversation` event carries a
snapshot and its revision. An `unavailable` event ends observation when a fresh
snapshot cannot be returned. Closing the stream detaches the reader. Reopen the
conversation to see progress or results later. A `stop` request ends further
assistant work. Already committed grant changes retain their ordinary history.
