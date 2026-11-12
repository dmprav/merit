import { describe, expect, it, vi } from "vite-plus/test";

import { AuthenticationError } from "@merit/auth";

import { testOperations } from "../../tests/operations";
import { mcpScopes } from "../contracts";
import { handleWorkspaceMcp, mcpResourceMetadata } from "../index";

const config = {
  publishableKey: "test-key",
  issuer: "https://identity.example.test",
  resource: "http://localhost:3000/mcp/workspace",
};

describe("MCP authentication responses", () => {
  it.each([
    {
      failure: new AuthenticationError("unauthenticated"),
      status: 401,
      message: "Sign in required",
    },
    { failure: new AuthenticationError("disabled"), status: 403, message: "Account access denied" },
    {
      failure: new AuthenticationError("unavailable"),
      status: 503,
      message: "Authentication unavailable",
    },
    { failure: new Error("Internal details"), status: 503, message: "Authentication unavailable" },
  ])(
    "returns $status without reading tenant data: $message",
    async ({ failure, status, message }) => {
      const read = vi.fn();
      const response = await handleWorkspaceMcp(
        new Request(config.resource, { headers: { host: "localhost:3000" } }),
        config.resource,
        {
          authenticate: async () => {
            throw failure;
          },
          ...testOperations(),
          workspace: { ...testOperations().workspace, readRound: read },
        },
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");

      const challenge = response.headers.get("WWW-Authenticate");
      const metadata =
        'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp/workspace"';
      const expectedChallenge = status === 401 ? metadata : null;

      expect(challenge).toBe(expectedChallenge);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("serves resource discovery and fails closed when configuration is missing", async () => {
    expect(await mcpResourceMetadata(config).json()).toMatchObject({
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: mcpScopes,
    });
    expect(mcpResourceMetadata({ ...config, issuer: "" }).status).toBe(503);
  });
});

it.each(["https://attacker.example", "http://localhost:3001", "https://localhost:3000", "null"])(
  "rejects an untrusted Origin %s before authentication",
  async (origin) => {
    const authenticate = vi.fn();
    const response = await handleWorkspaceMcp(
      new Request(config.resource, {
        method: "OPTIONS",
        headers: { host: "localhost:3000", Origin: origin },
      }),
      config.resource,
      { ...testOperations(), authenticate },
    );
    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  },
);
it("supports modern MCP preflight without authenticating the browser", async () => {
  const authenticate = vi.fn();
  const response = await handleWorkspaceMcp(
    new Request(config.resource, {
      method: "OPTIONS",
      headers: { host: "localhost:3000", Origin: "http://localhost:3000" },
    }),
    config.resource,
    { ...testOperations(), authenticate },
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Mcp-Method");
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Mcp-Name");
  expect(authenticate).not.toHaveBeenCalled();
});
