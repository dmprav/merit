import type { ComponentProps } from "react";

import type { RoundsData } from "@merit/grantmaking-web/contracts/pages";
import { FundingRoundsView } from "@merit/grantmaking-web/rounds";

import { WorkspaceCreateAction } from "./creation-action";

export const FundingRoundsWork = ({
  data,
  ...props
}: Pick<ComponentProps<typeof FundingRoundsView>, "renderRoundLink" | "renderApplicationsLink"> & {
  data: RoundsData;
}) => (
  <FundingRoundsView
    {...props}
    rounds={data.rounds}
    createAction={data.createRound && <WorkspaceCreateAction data={data.createRound} />}
  />
);
