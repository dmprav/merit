# Developing MCP tools

MCP adapts Merit's shared business operations for authenticated clients. The
[MCP guide](../../docs/guides/mcp.md) describes the public contract, permissions,
and recovery behavior. [MCP operations](../../docs/guides/mcp-operations.md)
covers provider configuration and live access verification.

## Add or change a tool

Keep a tool's description, schemas, and argument translation together in its
feature. Funding-round registration is grouped by reading, preparation, intake,
reviews, and recommendations; [tools.ts](src/features/grantmaking/tools.ts)
composes those workflows. Response presenters and schemas belong beside them.

Reuse named command schemas from the owning business module, such as
`intakeChanges.saveRevision` or `contactCommands.restore`. A tool's meaning must
not depend on a union schema's array order. Keep authorization, lifecycle rules,
and transaction boundaries in the business operation.

Features that narrow or combine operations declare what they consume in
`operations.ts`; single-service features such as `reviewer` and `navigation`
consume their owning business service interface directly in `tools.ts`. Inputs use
business contracts and an explicit actor; result types reuse the business
operation's public outcome. Workflow registration accepts only its required
operations. [App composition](src/app/operations.ts) combines these interfaces,
and application assembly supplies the owning business packages' bound services.
MCP consumes those services independently of product request context.

Register tools through the [shared registrar](src/components/register-tool.ts).
It handles OAuth scopes, validates outgoing results, and contains unexpected
failures. Preserve explicit scopes, annotations, revision preconditions, and
response schemas when changing a registration.

## Verify behavior

Run `vp run @merit/mcp#test`. Dispatch tests exercise tools through the MCP client
and HTTP handler with injected operations. Assert the intended business action,
original revision, verified actor, and presented result independently of the
registration table. Include payload-bearing commands as well as empty lifecycle
transitions.

Run the owning module's tests when changing shared schemas, and
`vp run architecture` after moving code or changing dependencies. The
[verification guide](../../docs/guides/verification.md#verification) covers type
checks and database integration tests for persisted behavior.
