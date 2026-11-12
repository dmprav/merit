# Configure and verify MCP access

Use this guide to configure the identity provider and verify delegated workspace
access for a local or deployed Merit instance. The
[MCP client guide](mcp.md) owns connection steps, available scopes, tool contracts,
and recovery behavior; this guide covers provider setup and operational checks.

## Configure workspace authentication

First configure [real sign-in](development.md#configure-real-sign-in). The local
workspace fixture identity applies only to web requests, never to MCP.

1. Set `APP_ORIGIN` to the application origin.
2. In Clerk, add the exact `/mcp/workspace` URL under **Agents → MCP servers**.
   The resource URL and client connection must match, including trailing slashes.
3. Enable the intended clients and require PKCE.
4. Configure the [published scopes](mcp.md#choose-client-access) as custom OAuth
   scopes for the intended clients: `workspace:read`, `grants:write`, `team:write`,
   `reviews:read`, `reviews:write`, `profile:read`, `profile:write`,
   `onboarding:read`, `onboarding:write`, `admin:read`, and `admin:write`.
   Grant only the scopes needed for the person's task. Existing clients must
   request additional consent before using newly added scopes; existing tokens
   do not acquire those permissions automatically.

See [Clerk MCP setup](https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server)
and [OAuth scope settings](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
for provider configuration.

## Verify the connection

Resource metadata is served at
`/.well-known/oauth-protected-resource/mcp/workspace`. It advertises the exact
resource, configured issuer, and supported scopes. A signed-out request to
`/mcp/workspace` receives an authentication challenge and no workspace data.
The removed `/mcp` endpoint returns 404.

With a provisioned user, discover a workspace, read an application, and save a
recommendation with fictional data. Verify the result and client provenance in the
web workspace. Check read-only and grant-editing clients cannot administer the
team or use the new scope families; revoke membership and confirm subsequent
workspace calls fail. Test an external reviewer without membership, wrong-email
invitation acceptance, a non-operator using admin tools, and an account demo reset
with its original workspace ID retried. Check consent, refresh,
sign-out, and token revocation with the clients you intend to support. Automated
[verification](verification.md#verification) covers transport, signed token
verification, shared operations, access isolation, and persisted provenance; it
does not replace live provider and client testing.

For changes to tool registration and contracts, follow the
[MCP development guide](../../interfaces/mcp/README.md).

## Troubleshoot authentication

If authentication fails, check the exact resource URL, issuer, granted scopes, and
current authority for the requested tool. Workspace membership is not required
for an invited reviewer, onboarding, or operator administration. Host validation uses `APP_ORIGIN`. Browser requests must have
the exact application origin, including scheme and port; opaque and other origins
are rejected before authentication. Native and server clients may omit Origin.
A hosted client cannot reach your computer's localhost without an appropriate
development connection.
