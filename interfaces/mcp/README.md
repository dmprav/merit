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
