# Developing MCP tools

MCP adapts Merit's shared business operations for authenticated clients. The
[MCP guide](../../docs/guides/mcp.md) describes the public contract, permissions,
and recovery behavior. [MCP operations](../../docs/guides/mcp-operations.md)
covers provider configuration and live access verification.

## Add or change a tool

Define each tool in the owning capability's server-side `ai` package. Keep its
description, input and result schemas, and argument translation together. Inject
the authenticated actor and the operations it uses. For example,
[Applications](../../capabilities/applications/ai/src/tools.ts) adapts application
intake commands, while [Grantmaking](../../capabilities/grantmaking/ai/src/tools.ts)
presents cross-capability queries such as the applications associated with a contact.
The owning business operation checks permissions and revision preconditions.

Use the capability factory directly in a first-party feature. For example,
`createReviewerTools(actor, reviewer)` from `@merit/reviews-ai` exposes the
reviewer's participation tools. Manager review tools have a separate factory.
The [tool runtime](../../foundation/ai/src/tool.ts) validates inputs and outputs
and returns safe diagnostics when an operation fails.

To publish a capability tool, include its factory in the [MCP catalog](src/app/tools.ts)
and assign its OAuth scope and client hints in the [publication policy](src/app/publication.ts).
The [MCP server](src/app/server.ts) enforces the scope and formats protocol
responses. Workspace discovery also reports the remote client's granted scopes.
[Application assembly](../../app/src/server/mcp.server.ts) supplies each factory's
operations and the request's verified identity.

## Verify behavior

Run `vp run @merit/mcp#test`. Dispatch tests exercise tools through the TanStack MCP HTTP client
and request handler with injected operations. Assert the intended business action,
original revision, verified actor, and presented result independently of the
registration table. Include payload-bearing commands as well as empty lifecycle
transitions.

Run the owning module's tests when changing shared schemas, and
`vp run architecture` after moving code or changing dependencies. The
[verification guide](../../docs/guides/verification.md#verification) covers type
checks and database integration tests for persisted behavior.

## Evaluate how an assistant uses the catalog

With PostgreSQL running (`docker compose up -d --wait postgres`), run the scripted
scenarios from the repository root. The default uses scripted controls and
consumes no model quota.

```sh
vp run eval:mcp
vp run eval:mcp --workflow contacts
vp run eval:mcp --tool invite_reviewer --list
vp run eval:mcp --case track-unassigned --case compose-invite
```

Use `--list` to preview any selection without starting PostgreSQL or a model.
A tool filter includes cases that exercise the tool and related cases where
calling it would be a mistake. Repeat a filter to include multiple values.
Combine different filters to narrow the selection.

For a live run, add the client and a model available with your CLI login, for
example `vp run eval:mcp codex MODEL --tool invite_reviewer` or
`vp run eval:mcp claude MODEL --workflow contacts`. To use API billing, add
`--api-key` and set `OPENAI_API_KEY` (Codex) or `ANTHROPIC_API_KEY` (Claude).

Claude Code can include the subscription operator’s email in model context.
For subscription trials the runner identifies the fictional user from the
Merit connection in a system instruction. The scenario prompt stays the same.

Each case starts with fresh data and the actor and scopes from its workflow
definition. The scripted client discovers records and revisions through the
published tools. The report saves after each case and grades three things
separately: the observed calls and responses, any checked changes to stored data
or sent messages, and the final reply. A reply can pass its automated checks
and still need human review. The report includes the criterion for that review.
For a before-and-after comparison, use the same filters,
client, model and login mode, then run
`vp run eval:mcp:report BASE.json CANDIDATE.json` with the saved paths.

Add scenarios to the owning workflow’s `.cases.ts` file alongside its
[fixtures and graders](../../app/tests/evals/mcp/workflows). Each definition
names a preparer, supplies the prompt and expected outcomes, and lists related
tools. Held-out wording variants share the original preparer and grants. The
[inventory](../../app/tests/evals/mcp/registry.ts) combines the workflows for
selection and reporting.

## Use workspace tools in a Merit AI conversation

The [assistant catalog](src/assistant/catalog.ts) binds the signed-in actor and
workspace on the server. Discovery returns that workspace, and reviewer lookups
use its slug even when the model omits it. Account-level demo provisioning is
available only through onboarding and MCP. The catalog keeps the permissions
used by each result and includes record and version references for evidence.
The turn runtime stores write previews and presents them for approval. Execute
rebuilds the preview from current records before invoking the capability command.
