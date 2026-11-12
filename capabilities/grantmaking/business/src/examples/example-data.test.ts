import { assert, expect, it } from "vite-plus/test";

import { encodeMoney, sum, parseMoney } from "@merit/money";

import { getExampleRound } from "./get-example-round";

it("keeps each fictional itemized budget equal to the requested amount", () => {
  for (const application of getExampleRound().applications) {
    const budget = application.submission!.answers.find(
      (answer) => answer.question === "Submitted budget breakdown (EUR)",
    )!;
    const amounts = budget.response.split("\n").map((line) => {
      const amountText = line.split(": €")[1];

      assert.isDefined(amountText);

      const amount = parseMoney(amountText);

      if (!amount.ok) {
        throw new Error("Invalid fixture budget line");
      }

      return amount.value;
    });

    expect(encodeMoney(sum(amounts))).toEqual(encodeMoney(application.requested!));
  }
});

it("counts conditional allocations in full and separates outdated from missing reviews", () => {
  const round = getExampleRound();

  expect({
    ...round.totals,
    requested: encodeMoney(round.totals.requested),
    proposed: encodeMoney(round.totals.proposed),
    remaining: encodeMoney(round.totals.remaining!),
  }).toEqual({
    unknownRequests: 0,
    requested: { minorUnits: "7400000", currency: "EUR" },
    proposed: { minorUnits: "5200000", currency: "EUR" },
    remaining: { minorUnits: "800000", currency: "EUR" },
    reviews: { assigned: 6, submitted: 5, current: 4, outdated: 1, outstanding: 1, unknown: 0 },
  });
  assert.isDefined(round.applications[2]);
  assert.isDefined(round.applications[2].assessments[1]);
  expect(round.applications[2].assessments.map((review) => review.status)).toEqual([
    "outdated",
    "outstanding",
  ]);
  expect(round.applications[2].assessments[1].submission).toBeNull();
  expect(encodeMoney(round.applications[2].managerRecommendation!.allocation).minorUnits).toBe("0");
});

it("keeps each read independent", () => {
  const round = getExampleRound();
  const application = round.applications[0];

  assert.isDefined(application);

  const evidence = application.evidence[0];

  assert.isDefined(evidence);

  evidence.passage = "Changed by a caller";
  const freshApplication = getExampleRound().applications[0];

  assert.isDefined(freshApplication);

  const freshEvidence = freshApplication.evidence[0];

  assert.isDefined(freshEvidence);
  expect(freshEvidence.passage).toContain("We did not count unique people");
});
