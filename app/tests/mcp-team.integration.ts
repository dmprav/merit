import { assert, expect } from "vite-plus/test";

import { actor } from "@merit/organizations/testing/workspace";

import { transportTest as it } from "./fixtures/transport-test";

it("lists current workspace members for a manager selecting a round owner", async ({
  transport: { callMcp },
}) => {
  const directory = await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_team_members");
  const result = directory.structuredContent;
  assert(result && typeof result === "object" && "members" in result);
  expect(result).toMatchObject({ status: "ok" });
  expect(result.members).toContainEqual(
    expect.objectContaining({
      userId: actor.userId,
      role: "program_manager",
      active: true,
    }),
  );
});
