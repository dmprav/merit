import { commitmentOf } from "@merit/decisions/domain";
import { sum } from "@merit/money";

import { roundView } from "../api/queries/round-view";
import { fundingRoundOverviewSchema } from "../domain/model";
import { exampleDecisions, exampleRound } from "./example-data";

export const getExampleRound = () => {
  const committed = sum(Object.values(exampleDecisions).map((decision) => commitmentOf(decision)));
  const round = roundView(fundingRoundOverviewSchema.parse(exampleRound), committed);
  if (round.budget === null || round.meetingDate === null || round.totals.remaining === null) {
    throw new Error("The example round must have a budget and committee date");
  }

  return {
    ...round,
    budget: round.budget,
    meetingDate: round.meetingDate,
    totals: { ...round.totals, remaining: round.totals.remaining },
    isExample: true,
  };
};
