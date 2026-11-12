import { roundView } from "../api/queries/round-view";
import { fundingRoundOverviewSchema } from "../domain/model";
import { exampleRound } from "./example-data";

export const getExampleRound = () => {
  const round = roundView(fundingRoundOverviewSchema.parse(exampleRound));
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
