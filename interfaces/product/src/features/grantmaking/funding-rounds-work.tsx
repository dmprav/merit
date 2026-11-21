import type { ComponentProps } from "react";

import type { RoundsData } from "@merit/grantmaking-web/contracts/pages";
import { CreateAction } from "@merit/grantmaking-web/creation";
import { FundingRoundsView } from "@merit/grantmaking-web/rounds";

export const FundingRoundsWork = ({
  data,
  ...props
}: Pick<ComponentProps<typeof FundingRoundsView>, "renderRoundLink" | "renderApplicationsLink"> & {
  data: RoundsData;
}) => (
  <FundingRoundsView
    {...props}
    rounds={data.rounds}
    createAction={data.createRound && <CreateAction data={data.createRound} />}
  />
);
