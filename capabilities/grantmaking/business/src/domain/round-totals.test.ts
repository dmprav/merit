import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { fromMinorUnits } from "@merit/money";

import { summarizeRound } from "./summaries";

it("counts the manager allocation independently of the reviewer's proposed amount", () => {
  const applications = [
    {
      version: materialVersionSchema.parse(1),
      requested: fromMinorUnits(2400000n),
      managerRecommendation: { allocation: fromMinorUnits(2000000n) },
      assessments: [
        {
          criteriaChanged: false,
          criteriaUnknown: false,
          submission: {
            applicationVersion: materialVersionSchema.parse(1),
            recommendation: { allocation: fromMinorUnits(1000000n) },
          },
        },
      ],
    },
  ];

  const totals = summarizeRound(fromMinorUnits(6000000n), applications);

  expect(totals.proposed).toEqual(fromMinorUnits(2000000n));
});

it("leaves the budget unallocated when no recommendation has been recorded", () => {
  const applications = [
    {
      version: materialVersionSchema.parse(1),
      requested: null,
      managerRecommendation: null,
      assessments: [],
    },
  ];

  const totals = summarizeRound(fromMinorUnits(6000000n), applications);

  expect(totals.proposed).toEqual(fromMinorUnits(0n));
  expect(totals.remaining).toEqual(fromMinorUnits(6000000n));
});

it("reports a negative balance for an over-budget allocation without changing its input", () => {
  const applications = [
    {
      version: materialVersionSchema.parse(1),
      requested: null,
      managerRecommendation: { allocation: fromMinorUnits(7400000n) },
      assessments: [],
    },
  ];
  const before = structuredClone(applications);

  const totals = summarizeRound(fromMinorUnits(6000000n), applications);

  expect(totals.remaining).toEqual(fromMinorUnits(-1400000n));
  expect(applications).toEqual(before);
});

it("returns zero activity and the full budget for a round with no applications", () => {
  expect(summarizeRound(fromMinorUnits(6000000n), [])).toEqual({
    unknownRequests: 0,
    requested: fromMinorUnits(0n),
    proposed: fromMinorUnits(0n),
    remaining: fromMinorUnits(6000000n),
    reviews: { assigned: 0, submitted: 0, current: 0, outdated: 0, outstanding: 0, unknown: 0 },
  });
});

it("counts unknown requested amounts separately while summing known amounts", () => {
  const applications = [null, fromMinorUnits(2400000n)].map((requested) => ({
    requested,
    version: materialVersionSchema.parse(1),
    managerRecommendation: null,
    assessments: [],
  }));

  const totals = summarizeRound(null, applications);

  expect(totals.requested).toEqual(fromMinorUnits(2400000n));
  expect(totals.unknownRequests).toBe(1);
  expect(totals.remaining).toBeNull();
});

it.each([null, fromMinorUnits(0n)])(
  "distinguishes an unset budget from a zero budget: %s",
  (budget) => {
    expect(summarizeRound(budget, []).remaining).toEqual(budget);
  },
);
