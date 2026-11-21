import { assert, expect, it, vi } from "vite-plus/test";

import type { ReviewerService, ReviewerSummary } from "@merit/reviews/api";

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
  const assignment = (reviewer: string): ReviewerSummary => ({
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 1,
    status: "accepted",
    reviewer,
    hasSubmitted: false,
    email: `${reviewer}@example.test`,
    applicationTitle: "Neighbour Table",
    applicant: "Neighbours",
    organization: "Alder",
    workspaceSlug: "alder",
    dueDate: null,
    managerName: "Dana",
    managerEmail: "dana@example.test",
    applicationVersion: 1,
    criteriaVersion: 1,
    basisComparison: {
      applicationVersion: "same",
      criteriaVersion: "same",
      criteriaContent: "same",
    },
    materialChanged: false,
    criteriaChanged: false,
    conflict: "",
    delivery: "sent",
    notification: null,
    expiresAt: "2026-12-01T00:00:00.000Z",
  });

  const sam = assignment("sam");
  const jules = assignment("jules");

  const list: ReviewerService["list"] = async (actor) => ({
    status: "ok",
    value: [sam, jules].filter((item) => item.reviewer === actor.userId),
  });

  const reviewer = { list, read: vi.fn(), respond: vi.fn(), saveDraft: vi.fn(), submit: vi.fn() };

  const assignments = (userId: string) => {
    const tools = createReviewerTools({ userId }, reviewer);
    const tool = tools.find(({ name }) => name === "list_my_reviews");
    assert(tool);
    return tool.execute({});
  };

  const results = await Promise.all([assignments("sam"), assignments("jules")]);
  expect(results).toEqual([
    { status: "ok", assignments: [sam], nextCursor: null },
    { status: "ok", assignments: [jules], nextCursor: null },
  ]);
});
