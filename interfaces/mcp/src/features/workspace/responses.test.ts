import { expect, it } from "vite-plus/test";

import { connect } from "../../../tests/client";
import { testOperations } from "../../../tests/operations";

it("presents canonical workspace home URLs for grant-work and settings-only members", async () => {
  const operations = testOperations();
  operations.team.workspacesPage.mockResolvedValue({
    status: "ok",
    value: [
      {
        id: "w-1",
        name: "Alder Foundation",
        slug: "alder",
        kind: "standard",
        demoExpiresAt: null,
        role: "program_manager",
        administration: "owner",
        canWorkOnGrants: true,
      },
      {
        id: "w-2",
        name: "Birch Foundation",
        slug: "birch",
        kind: "standard",
        demoExpiresAt: null,
        role: "member",
        administration: "none",
        canWorkOnGrants: false,
      },
    ],
    nextCursor: null,
  });

  const client = await connect(operations);
  try {
    const result = await client.callTool({ name: "list_workspaces", arguments: {} });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      workspaces: [
        { slug: "alder", url: "http://localhost:3000/app/alder/rounds" },
        { slug: "birch", url: "http://localhost:3000/app/birch/settings/members" },
      ],
    });
  } finally {
    await client.close();
  }
});
