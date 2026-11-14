import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { newPreparedRound } from "../../domain/preparation";
import { encodeRound, decodeRound } from "./encoding";

it.each([null, fromMinorUnits(10025n)])(
  "round-trips a round with budget %s through stored history",
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
  },
);
