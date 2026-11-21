import { assert, expect, it, vi } from "vite-plus/test";

import type { GrantmakingOperations } from "./operations";
import { createGrantmakingTools } from "./tools";

it("lists contact-related applications using the signed-in actor's grantmaking query", async () => {
  const listContactApplications = vi
    .fn<GrantmakingOperations["listContactApplications"]>()
    .mockResolvedValue({ status: "ok", applications: [], nextCursor: null });
  const actor = { userId: "manager" };
  const queries = {
    listContactApplications,
    listRoundSummaries: vi.fn(),
    readRound: vi.fn(),
    listApplications: vi.fn(),
    readApplication: vi.fn(),
    listReviews: vi.fn(),
    roundContent: vi.fn(),
    applicationContent: vi.fn(),
    roundHistory: vi.fn(),
    applicationHistory: vi.fn(),
    listWorkspaceActivity: vi.fn(),
    searchWorkspace: vi.fn(),
  };
  const tools = createGrantmakingTools(actor, queries, "https://merit.example");
  const related = tools.find((tool) => tool.name === "list_contact_applications");
  assert(related);
  const input = { workspaceSlug: "alder", contactId: crypto.randomUUID(), limit: 10 };
  expect(await related.execute(input)).toEqual({
    status: "ok",
    applications: [],
    nextCursor: null,
  });
  expect(listContactApplications).toHaveBeenCalledWith(actor, input);
});
