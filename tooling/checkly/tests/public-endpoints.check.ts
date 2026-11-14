import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";

import { resolveTargetBaseUrl } from "./target";

const baseUrl = resolveTargetBaseUrl();

new ApiCheck("landing-page", {
  name: "Landing page serves framed response",
  frequency: Frequency.EVERY_10M,
  tags: ["public", "site"],
  request: {
    method: "GET",
    url: `${baseUrl}/`,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers("content-security-policy").contains("frame-ancestors 'none'"),
      AssertionBuilder.textBody().contains("Bring your grantmaking together."),
    ],
  },
});

new ApiCheck("mcp-docs-page", {
  name: "MCP documentation page is available",
  frequency: Frequency.EVERY_15M,
  tags: ["public", "mcp"],
  request: {
    method: "GET",
    url: `${baseUrl}/docs/mcp`,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers("content-type").contains("text/html"),
      AssertionBuilder.textBody().contains("/mcp/workspace"),
    ],
  },
});

new ApiCheck("demo-entry-page", {
  name: "Demo introduction is uncached and non-provisioning",
  frequency: Frequency.EVERY_15M,
  tags: ["public", "demo"],
  request: {
    method: "GET",
    url: `${baseUrl}/demo`,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers("cache-control").contains("no-store"),
      AssertionBuilder.textBody().contains("Browse the workspace"),
    ],
  },
});

new ApiCheck("sign-in-page", {
  name: "Sign-in route renders with framing protection",
  frequency: Frequency.EVERY_15M,
  tags: ["public", "auth"],
  request: {
    method: "GET",
    url: `${baseUrl}/app/sign-in`,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers("content-security-policy").contains("frame-ancestors 'none'"),
      AssertionBuilder.textBody().contains("Sign in"),
    ],
  },
});
