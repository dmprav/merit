import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { reviewCriteriaSchema } from "../domain/criteria";
import { fundingRoundSchema } from "../domain/model";
import { newPreparedRound } from "../domain/preparation";
import { encodeRound, decodeRound } from "./encoding";

it.each([null, fromMinorUnits(10025n)])(
  "preserves round budget and criteria in public JSON: %s",
  (budget) => {
    const round = {
      ...newPreparedRound(
        { title: "Round" },
        {
          id: "round",
          foundation: "Alder",
          manager: { name: "Dana", email: null },
          snapshotDate: "2027-03-15",
        },
      ),
      budget,
    };
    expect(decodeRound(JSON.parse(JSON.stringify(encodeRound(round))))).toEqual(round);
    expect(fundingRoundSchema.parse(round)).toEqual(round);
    expect(() => fundingRoundSchema.parse({ ...round, budget: fromMinorUnits(-1n) })).toThrow();
    expect(
      reviewCriteriaSchema.parse([{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }]),
    ).toEqual([{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }]);
    expect(reviewCriteriaSchema.safeParse([{ title: "" }]).success).toBe(false);
  },
);
