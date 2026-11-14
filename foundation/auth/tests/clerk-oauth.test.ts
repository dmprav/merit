import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { verifyClerkOAuth } from "../src/clerk-oauth";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@clerk/backend", () => ({ createClerkClient: () => ({ authenticateRequest: verify }) }));
const config = {
  publishableKey: "test-key",
  secretKey: "test-secret",
  issuer: "https://identity.example.test",
  resource: "http://localhost:3000/mcp/workspace",
};

const request = () =>
  new Request(config.resource, {
    headers: { Authorization: "Bearer test-token" },
  });

beforeEach(() => verify.mockReset());

describe("Clerk OAuth identity verification", () => {
  it("restricts verification to OAuth tokens for the resource and returns verified identity facts", async () => {
    verify.mockResolvedValue({
      toAuth: () => ({
        isAuthenticated: true,
        userId: "user_alder",
        scopes: ["workspace:read"],
        clientId: "test-client",
      }),
    });

    expect(await verifyClerkOAuth(request(), config)).toEqual({
      clerkUserId: "user_alder",
      scopes: ["workspace:read"],
      clientId: "test-client",
    });
    expect(verify).toHaveBeenCalledWith(expect.any(Request), {
      acceptsToken: "oauth_token",
      audience: config.resource,
    });
  });

  it("rejects cookies and missing configuration without token verification", async () => {
    await expect(
      verifyClerkOAuth(
        new Request(config.resource, {
          headers: { Cookie: "__session=example" },
        }),
        config,
      ),
    ).rejects.toMatchObject({ reason: "unauthenticated" });
    await expect(verifyClerkOAuth(request(), { ...config, secretKey: "" })).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("distinguishes unavailable verification from rejected identity", async () => {
    verify.mockRejectedValueOnce(new Error("identity provider unavailable"));

    await expect(verifyClerkOAuth(request(), config)).rejects.toMatchObject({
      reason: "unavailable",
    });

    verify.mockResolvedValue({ toAuth: () => ({ isAuthenticated: false, userId: null }) });

    await expect(verifyClerkOAuth(request(), config)).rejects.toMatchObject({
      reason: "unauthenticated",
    });
  });
});
