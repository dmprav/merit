import assert from "node:assert/strict";

const baseUrl = process.env.MERIT_BASE_URL ?? "http://localhost:3000";

const assertFramingProtection = (response: Response) =>
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

const landing = await fetch(new URL("/", baseUrl));
assert.equal(landing.status, 200);
assertFramingProtection(landing);
assert.ok((await landing.text()).includes("Bring your grantmaking together."));
const mcpGuide = await fetch(new URL("/docs/mcp", baseUrl));
assert.equal(mcpGuide.status, 200);
assert.match(mcpGuide.headers.get("content-type") ?? "", /text\/html/);
assert.ok((await mcpGuide.text()).includes("/mcp/workspace"));
const signIn = await fetch(new URL("/app/sign-in", baseUrl));
assert.equal(signIn.status, 200);
assertFramingProtection(signIn);
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

assert.equal((await fetch(new URL("/mcp", baseUrl))).status, 404);

const missing = await fetch(new URL("/not-a-route", baseUrl));
assert.equal(missing.status, 404);
assertFramingProtection(missing);
assert.ok((await missing.text()).includes("Back to Merit"));
for (const [path, recovery] of [
  ["/app", "Workspace could not be loaded"],
  ["/app/alder/rounds/local-connections-2027-k7m2p9x4n6rt", "Round could not be loaded"],
  ["/app/alder/applications/workshop-saturdays-b8q3w5j7c2df", "Application could not be loaded"],
] as const) {
  const protectedPage = await fetch(new URL(path, baseUrl));
  assertFramingProtection(protectedPage);
  assert.match(protectedPage.headers.get("cache-control") ?? "", /no-store/);
  const page = await protectedPage.text();
  // Missing auth configuration renders a recovery page; scoped loaders report service failure.
  assert.equal(
    protectedPage.status,
    page.includes("Sign in to your workspace") || path === "/app" ? 200 : 500,
  );
  assert.ok(page.includes("Sign in to your workspace") || page.includes(recovery));
  if (page.includes("Sign in to your workspace")) {
    assert.ok(page.includes('href="/app/sign-in"'), "Sign-in links must use the app namespace");
  }
  assert.ok(!page.includes("Neighbour Table"), "Signed-out requests must not receive tenant data");
}
for (const path of ["/admin/organizations", `/invitations/${"a".repeat(64)}`]) {
  const page = await fetch(new URL(path, baseUrl));
  assertFramingProtection(page);
}
const protectedMcp = await fetch(new URL("/mcp/workspace", baseUrl), { method: "POST" });
assert.ok(
  [401, 503].includes(protectedMcp.status),
  "Protected MCP must require configured authentication",
);
assert.match(protectedMcp.headers.get("cache-control") ?? "", /no-store/);
console.log("Public web/MCP, protected access, and 404 recovery passed.");
