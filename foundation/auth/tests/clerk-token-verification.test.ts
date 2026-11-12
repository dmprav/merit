import { generateKeyPairSync, sign } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";

const requiredScope = "test:read";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const config = {
  publishableKey: `pk_test_${Buffer.from("merit-test.clerk.accounts.dev$").toString("base64")}`,
  secretKey: "sk_test_local_verification_only",
  issuer: "https://merit-test.clerk.accounts.dev",
  resource: "http://localhost:3000/mcp/workspace",
};

// Exercise the real Clerk verifier using local signing keys; no requests reach Clerk.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (new URL(url).pathname !== "/v1/jwks") {
        throw new Error("Unexpected verification request");
      }

      return Response.json({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid: "merit-test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    }),
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const token = (overrides: Record<string, unknown> = {}, type = "at+jwt", key = privateKey) => {
  const now = Math.floor(Date.now() / 1000);

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

  const payload = {
    sub: "user_alder",
    iss: config.issuer,
    aud: config.resource,
    iat: now,
    nbf: now - 10,
    exp: now + 300,
    scope: requiredScope,
    client_id: "test-client",
    jti: "test-token",
    ...overrides,
  };
  const input = `${encode({ alg: "RS256", typ: type, kid: "merit-test-key" })}.${encode(payload)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
};

const request = (bearer: string) =>
  new Request(config.resource, { headers: { Authorization: `Bearer ${bearer}` } });

describe("Clerk OAuth verification", () => {
  it("accepts a signed, scoped access token for the configured resource", async () => {
    expect(await verifyClerkOAuth(request(token()), config)).toEqual({
      clerkUserId: "user_alder",
      scopes: [requiredScope],
      clientId: "test-client",
    });
  });

  it.each([
    ["wrong audience", { aud: "https://other.example/mcp" }],
    ["missing audience", { aud: undefined }],
    ["wrong issuer", { iss: "https://other.example" }],
    ["missing issuer", { iss: undefined }],
    ["expired token", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["future token", { nbf: Math.floor(Date.now() / 1000) + 60 }],
  ])("rejects %s", async (_name, claims) => {
    await expect(verifyClerkOAuth(request(token(claims)), config)).rejects.toMatchObject({
      reason: "unauthenticated",
    });
  });

  it("rejects forged signatures and website session tokens", async () => {
    await expect(
      verifyClerkOAuth(request(token({}, "at+jwt", otherKey)), config),
    ).rejects.toMatchObject({ reason: "unauthenticated" });
    await expect(
      verifyClerkOAuth(request(token({ sid: "sess_test" }, "JWT")), config),
    ).rejects.toMatchObject({ reason: "unauthenticated" });
  });

  it("preserves granted scopes for per-tool authorization", async () => {
    expect(
      await verifyClerkOAuth(request(token({ scope: "workspace:read team:write" })), config),
    ).toMatchObject({ scopes: ["workspace:read", "team:write"] });
  });

  it("rejects a token without verified client identity", async () => {
    await expect(
      verifyClerkOAuth(request(token({ client_id: undefined })), config),
    ).rejects.toMatchObject({ reason: "unauthenticated" });
  });
});
