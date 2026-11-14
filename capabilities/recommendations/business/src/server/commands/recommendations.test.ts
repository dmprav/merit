import { describe, expect, it, vi } from "vite-plus/test";

import type { Database } from "@merit/db";

import { saveFundingRecommendation } from "./recommendations";

describe("saveFundingRecommendation", () => {
  it("returns invalid_recommendation without opening a transaction when request validation fails", async () => {
    const transaction = vi.fn();
    const db = { transaction } as unknown as Database;

    const result = await saveFundingRecommendation(
      db,
      { userId: "dana" },
      {
        workspaceSlug: "alder",
        publicId: "not-a-public-id",
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation: {
          position: "Fund",
          allocation: { minorUnits: "1000", currency: "EUR" },
          reasoning: "Valid reasoning",
        },
      },
    );

    expect(result).toEqual({ status: "invalid", error: "invalid_recommendation" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
