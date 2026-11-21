import { useNavigate, type LinkOptions } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import type { RoundData } from "@merit/grantmaking-web/contracts/pages";
import { CreateAction } from "@merit/grantmaking-web/creation";
import { FundingRoundView } from "@merit/grantmaking-web/rounds";

type FundingRoundWorkProps = Pick<
  ComponentProps<typeof FundingRoundView>,
  "section" | "onSectionChange" | "renderApplicationLink" | "renderReviewLink"
> & {
  data: RoundData;
  roundsLocation: LinkOptions;
};

export const FundingRoundWork = (props: FundingRoundWorkProps) => (
  <FundingRoundContent
    key={`${props.data.round.id}/${Boolean(props.data.preparation)}`}
    {...props}
  />
);

const FundingRoundContent = ({ data, roundsLocation, ...props }: FundingRoundWorkProps) => {
  const navigate = useNavigate();

  return (
    <FundingRoundView
      {...props}
      round={data.round}
      preparation={
        data.preparation
          ? { data: data.preparation, onDeleted: () => navigate(roundsLocation) }
          : undefined
      }
      applicationList={data.applicationList}
      applicationAction={data.createApplication && <CreateAction data={data.createApplication} />}
    />
  );
};
