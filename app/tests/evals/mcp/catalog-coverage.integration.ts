import { createMCPClient } from "@tanstack/ai-mcp";
import { expect } from "vite-plus/test";

import { readOnlyToolNames } from "@merit/mcp";

import { catalogTest } from "./catalog-trial";
import { evalCases } from "./registry";

catalogTest("covers the published MCP catalog and its discovery policy", async ({ catalog }) => {
  const { server } = await catalog("accessible-workspaces");
  const client = await createMCPClient({
    name: "catalog-coverage",
    transport: {
      type: "http",
      url: server.url,
      headers: { Authorization: `Bearer ${server.token}` },
    },
  });
  try {
    const tools = await client.tools();
    const published = tools.map(({ name }) => name).sort();
    for (const name of evalCases.flatMap((item) => [
      ...(item.relatedTools ?? []),
      ...(item.optionalTools ?? []),
    ])) {
      expect(published).toContain(name);
    }
    expect([...new Set(evalCases.flatMap(({ tools }) => tools))].sort()).toEqual(published);
    const readOnly = tools.filter(({ metadata }) => metadata.mcp.annotations?.readOnlyHint);
    expect(readOnly.map(({ name }) => name).sort()).toEqual([...readOnlyToolNames].sort());
  } finally {
    await client.close();
  }
});
