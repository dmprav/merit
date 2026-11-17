import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createQueryClient, privateKey } from "@merit/query";

import {
  listReviewerAssignments,
  readReviewerAssignment,
} from "../server/reviews/reviewer.functions";
import { reviewerListOptions, reviewerPageOptions } from "./reviewer-data";

vi.mock("../server/reviews/reviewer.functions", () => ({
  listReviewerAssignments: vi.fn(),
  readReviewerAssignment: vi.fn(),
  respondToReview: vi.fn(),
  saveReviewerDraft: vi.fn(),
  submitReviewerAssessment: vi.fn(),
}));

const assignmentId = "00000000-0000-4000-a000-000000000001";

beforeEach(() => {
  vi.mocked(listReviewerAssignments).mockReset();
  vi.mocked(readReviewerAssignment).mockReset();
});

describe("reviewer query options", () => {
  it("keeps reviewer assignments in the account-private cache", () => {
    for (const { queryKey } of [
      reviewerListOptions("alder"),
      reviewerPageOptions(assignmentId, "alder"),
    ]) {
      expect(queryKey.slice(0, privateKey.length)).toEqual([...privateKey]);
    }
  });

  it("reads the selected workspace's assignments with a cancellable request", async () => {
    vi.mocked(listReviewerAssignments).mockResolvedValue({ status: "ok", value: [] });

    await expect(createQueryClient().fetchQuery(reviewerListOptions("alder"))).resolves.toEqual({
      status: "ok",
      value: [],
    });
    const [call] = vi.mocked(listReviewerAssignments).mock.calls;
    expect(call?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.[0]?.data).toEqual({ workspaceSlug: "alder" });
  });

  it("reads one assignment with a cancellable request and renders denied access", async () => {
    vi.mocked(readReviewerAssignment).mockResolvedValue({ status: "not_found" });

    await expect(
      createQueryClient().fetchQuery(reviewerPageOptions(assignmentId, "alder")),
    ).resolves.toEqual({ status: "not_found" });
    const [call] = vi.mocked(readReviewerAssignment).mock.calls;
    expect(call?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.[0]?.data).toEqual({ assignmentId, workspaceSlug: "alder" });
  });

  it("fails unavailable reads instead of presenting them as results", async () => {
    vi.mocked(listReviewerAssignments).mockResolvedValue({ status: "unavailable" } as never);
    vi.mocked(readReviewerAssignment).mockResolvedValue({ status: "unavailable" } as never);
    const client = createQueryClient();

    await expect(client.fetchQuery(reviewerListOptions("alder"))).rejects.toThrow(
      "Service unavailable",
    );
    await expect(client.fetchQuery(reviewerPageOptions(assignmentId))).rejects.toThrow(
      "Service unavailable",
    );
  });
});
