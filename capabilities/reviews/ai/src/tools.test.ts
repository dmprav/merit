import { assert, expect, it, vi } from "vite-plus/test";

import type { ReviewerService } from "@merit/reviews/api";

import { createReviewerTools } from "./tools";

it("offers the reviewer only their participation tools", () => {
  const tools = createReviewerTools(
    { userId: "reviewer" },
    { list: vi.fn(), read: vi.fn(), respond: vi.fn(), saveDraft: vi.fn(), submit: vi.fn() },
  );
  expect(tools.map(({ name }) => name).sort()).toEqual([
    "get_reviewer_assignment",
    "list_my_reviews",
    "respond_to_review",
    "save_reviewer_draft",
    "submit_reviewer_assessment",
  ]);
});

it("lists only the signed-in reviewer's assignments without workspace or MCP services", async () => {
  const list = vi.fn<ReviewerService["list"]>().mockResolvedValue({ status: "ok", value: [] });
  const reviewer = { list, read: vi.fn(), respond: vi.fn(), saveDraft: vi.fn(), submit: vi.fn() };

  const assignments = (userId: string) => {
    const tools = createReviewerTools({ userId }, reviewer);
    const tool = tools.find(({ name }) => name === "list_my_reviews");
    assert(tool);
    return tool.execute({});
  };

  const results = await Promise.all([assignments("sam"), assignments("jules")]);
  expect(results).toEqual([
    { status: "ok", assignments: [], nextCursor: null },
    { status: "ok", assignments: [], nextCursor: null },
  ]);
  expect(list).toHaveBeenCalledWith({ userId: "sam" });
  expect(list).toHaveBeenCalledWith({ userId: "jules" });
});
