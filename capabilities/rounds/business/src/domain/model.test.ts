import { describe, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { reviewCriteriaSchema } from "./criteria";
import { fundingRoundSchema } from "./model";
import { newPreparedRound } from "./preparation";

const round = newPreparedRound(
  { title: "Round" },
  {
    id: "round",
    foundation: "Alder",
    manager: { name: "Dana", email: null },
    snapshotDate: "2027-03-15",
  },
);

describe("funding round model", () => {
  it.each([null, fromMinorUnits(0n), fromMinorUnits(10025n)])("accepts budget %s", (budget) => {
    expect(fundingRoundSchema.parse({ ...round, budget })).toEqual({ ...round, budget });
  });

  it("rejects a negative round budget", () => {
    expect(fundingRoundSchema.safeParse({ ...round, budget: fromMinorUnits(-1n) }).success).toBe(
      false,
    );
  });
});

describe("review criteria", () => {
  const criterion = { id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" };

  it("accepts identified, titled criteria", () => {
    expect(reviewCriteriaSchema.parse([criterion])).toEqual([criterion]);
  });

  it.each([
    { reason: "an ID", criteria: [{ title: "Fit" }] },
    { reason: "a title", criteria: [{ ...criterion, title: "" }] },
  ])("requires $reason", ({ criteria }) => {
    expect(reviewCriteriaSchema.safeParse(criteria).success).toBe(false);
  });

  it("rejects duplicate criterion IDs in recorded criteria", () => {
    expect(reviewCriteriaSchema.safeParse([criterion, criterion]).success).toBe(false);
  });
});
