import { assert, expect, it, vi } from "vite-plus/test";

import { createWorkspaceTools } from "./tools";

it("uses the supplied home URL for each workspace visible to the actor", async () => {
  const workspacesPage = vi.fn().mockResolvedValue({
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
        canViewTeam: true,
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
        canViewTeam: true,
      },
    ],
    nextCursor: null,
  });

  const workspaceHomeUrl = vi.fn(
    ({ slug }: { slug: string }) => `https://merit.example/home/${slug}`,
  );
  const tool = createWorkspaceTools(
    { userId: "dana" },
    { workspacesPage, membersPage: vi.fn(), workspaceHomeUrl },
  ).find((entry) => entry.name === "list_workspaces");
  assert(tool);
  const result = await tool.execute({});
  expect(result).not.toHaveProperty("grantedScopes");
  expect(result).toMatchObject({
    status: "ok",
    workspaces: [
      { slug: "alder", url: "https://merit.example/home/alder" },
      { slug: "birch", url: "https://merit.example/home/birch" },
    ],
  });
});
