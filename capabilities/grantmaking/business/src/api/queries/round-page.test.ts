import { expect, it } from "vite-plus/test";

import { encodeMoney, fromMinorUnits } from "@merit/money";

import { makeRound, makeReviewedApplication } from "../../../tests/fixtures";
import { decodeRoundPage, encodeRoundPage } from "./round-page";
import { roundView } from "./round-view";

it.each([null, fromMinorUnits(9007199254740993n)])(
  "round-trips whole-round facts without application records (budget %s)",
  (budget) => {
    const round = roundView(
      makeRound({
        budget,
        applications: [
          {
            ...makeReviewedApplication(),
            requested: fromMinorUnits(9007199254740995n),
          },
        ],
      }),
    );
    const data = encodeRoundPage(round);
    const restored = decodeRoundPage(JSON.parse(JSON.stringify(data)));
    expect(data).not.toHaveProperty("applications");
    expect(restored).not.toHaveProperty("applications");
    expect(restored.applicationCount).toBe(1);
    expect(restored.criteriaImpact).toEqual(round.criteriaImpact);
    expect(encodeMoney(restored.totals.requested).minorUnits).toBe("9007199254740995");
    expect(encodeRoundPage(restored)).toEqual(data);
  },
);

it("validates summary counts at the transport boundary", () => {
  const data = encodeRoundPage(roundView(makeRound()));
  expect(() => decodeRoundPage({ ...data, applicationCount: -1 })).toThrow();
  expect(() =>
    decodeRoundPage({ ...data, criteriaImpact: { assessments: -1, requests: 0 } }),
  ).toThrow();
});
