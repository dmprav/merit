import assert from "node:assert/strict";
import { resolve } from "node:path";

import { loadEnvLocalFiles, readPort } from "@merit/test-support/env";

loadEnvLocalFiles([
  resolve(import.meta.dirname, "../.env.local"),
  resolve(import.meta.dirname, "../../.env.local"),
]);

const baseUrl =
  process.env.MERIT_BASE_URL ?? `http://localhost:${readPort(process.env.MERIT_DEV_PORT, 3000)}`;

const publicHttps = new URL(baseUrl).protocol === "https:";

const assertHeaders = (response: Response) => {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const csp = response.headers.get("content-security-policy") ?? "";
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  if (publicHttps) {
    assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=[1-9]\d*/);
  }
};

const landing = await fetch(new URL("/", baseUrl));
assert.equal(landing.status, 200);
assertHeaders(landing);
const landingPage = await landing.text();
assert.ok(landingPage.includes("Bring your grantmaking together."));
const candidate = landing.headers.get("content-security-policy-report-only");
if (publicHttps || candidate) {
  const nonce = candidate?.match(/'nonce-([A-Za-z0-9+/]+=*)'/)?.[1];
  assert.ok(nonce, "HTTPS HTML needs the report-only script nonce");
  const scripts = landingPage.match(/<script\b[^>]*>/gi) ?? [];
  assert.ok(scripts.length > 0, "SSR must emit hydration scripts");
  assert.ok(
    scripts.every((script) => script.includes(`nonce="${nonce}"`)),
    "SSR scripts must carry the nonce advertised in the response header",
  );
}
const mcpGuide = await fetch(new URL("/docs/mcp", baseUrl));
assert.equal(mcpGuide.status, 200);
assert.match(mcpGuide.headers.get("content-type") ?? "", /text\/html/);
assert.ok((await mcpGuide.text()).includes("/mcp/workspace"));
const signIn = await fetch(new URL("/app/sign-in", baseUrl));
assert.equal(signIn.status, 200);
assertHeaders(signIn);
assert.ok((await signIn.text()).includes("Sign in"));
for (const path of ["/demo", "/demo/workshop-saturdays"]) {
  const response = await fetch(new URL(path, baseUrl));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const introduction = await response.text();
  assert.ok(introduction.includes("Explore the example"));
  assert.ok(introduction.includes("Browse the workspace"));
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    "GET and prefetch never provision demo workspaces",
  );
}

const missing = await fetch(new URL("/not-a-route", baseUrl));
assert.equal(missing.status, 404);
assertHeaders(missing);
assert.ok((await missing.text()).includes("Back to Merit"));
for (const [path, recovery] of [
  ["/app", "Workspace could not be loaded"],
  ["/app/alder/rounds/local-connections-2027-k7m2p9x4n6rt", "Round could not be loaded"],
  ["/app/alder/applications/workshop-saturdays-b8q3w5j7c2df", "Application could not be loaded"],
] as const) {
  const protectedPage = await fetch(new URL(path, baseUrl));
  assertHeaders(protectedPage);
  assert.match(protectedPage.headers.get("cache-control") ?? "", /no-store/);
  const page = await protectedPage.text();
  // Missing auth configuration renders a recovery page; scoped loaders report service failure.
  assert.equal(
    protectedPage.status,
    page.includes("Sign in to your workspace") || path === "/app" ? 200 : 500,
  );
  assert.ok(page.includes("Sign in to your workspace") || page.includes(recovery));
  if (page.includes("Sign in to your workspace")) {
    assert.ok(
      page.includes(`href="/app/sign-in?returnTo=${encodeURIComponent(path)}"`),
      "Sign-in links must return to the requested workspace page",
    );
  }
  assert.ok(!page.includes("Neighbour Table"), "Signed-out requests must not receive tenant data");
}
for (const path of ["/admin/organizations", `/invitations/${"a".repeat(64)}`]) {
  const page = await fetch(new URL(path, baseUrl));
  assertHeaders(page);
  if (path.startsWith("/invitations/")) {
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  }
}
const protectedMcp = await fetch(new URL("/mcp/workspace", baseUrl), { method: "POST" });
assert.ok(
  [401, 503].includes(protectedMcp.status),
  "Protected MCP must require configured authentication",
);
assertHeaders(protectedMcp);
assert.match(protectedMcp.headers.get("cache-control") ?? "", /no-store/);
console.log("Public web/MCP, protected access, and 404 recovery passed.");
