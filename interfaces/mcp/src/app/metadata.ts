import { mcpScopes } from "../contracts";

export const mcpResourceMetadata = (config: { issuer: string; resource: string }): Response => {
  if (!config.issuer) {
    return Response.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  return Response.json(
    {
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: mcpScopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
};
