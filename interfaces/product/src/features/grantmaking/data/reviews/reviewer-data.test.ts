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
  it("scopes reviewer list queries under privateKey, passes AbortSignal, and throws on unavailable", async () => {
    const options = reviewerListOptions("alder");
    expect(options.queryKey.slice(0, privateKey.length)).toEqual([...privateKey]);
    expect(options.gcTime).toBeUndefined();

    const client = createQueryClient();
    vi.mocked(listReviewerAssignments).mockResolvedValueOnce({ status: "ok", value: [] });
    await expect(client.fetchQuery(options)).resolves.toEqual({ status: "ok", value: [] });

    const [call] = vi.mocked(listReviewerAssignments).mock.calls;
    expect(call?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.[0]?.data).toEqual({ workspaceSlug: "alder" });

    vi.mocked(listReviewerAssignments).mockResolvedValueOnce({ status: "unavailable" } as never);
    await expect(client.fetchQuery(options)).rejects.toThrow("Service unavailable");
  });

  it("scopes reviewer page queries under privateKey, passes AbortSignal, preserves not_found, and throws on unavailable", async () => {
    const options = reviewerPageOptions(assignmentId);
    expect(options.queryKey.slice(0, privateKey.length)).toEqual([...privateKey]);
    expect(options.gcTime).toBeUndefined();

    const client = createQueryClient();
    vi.mocked(readReviewerAssignment).mockResolvedValueOnce({ status: "not_found" });
    await expect(client.fetchQuery(options)).resolves.toEqual({ status: "not_found" });

    const [call] = vi.mocked(readReviewerAssignment).mock.calls;
    expect(call?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.[0]?.data).toEqual({ assignmentId, workspaceSlug: undefined });

    vi.mocked(readReviewerAssignment).mockResolvedValueOnce({ status: "unavailable" } as never);
    await expect(client.fetchQuery(options)).rejects.toThrow("Service unavailable");
  });
});
