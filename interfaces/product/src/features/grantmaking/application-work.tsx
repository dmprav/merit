import { useNavigate, type LinkOptions } from "@tanstack/react-router";

import { ApplicationView } from "@merit/grantmaking-web/applications";
import type { ApplicationData } from "@merit/grantmaking-web/contracts/pages";
import { ApplicationRecommendation } from "@merit/recommendations-web/recommendations";

type ApplicationWorkProps = {
  data: ApplicationData;
  roundLocation: LinkOptions;
  returnLocation?: LinkOptions;
  tab?: "reviews";
  onTabChange: (tab: "evidence" | "reviews") => void | Promise<void>;
};

export const ApplicationWork = ({
  data,
  roundLocation,
  returnLocation,
  tab,
  onTabChange,
}: ApplicationWorkProps) => {
  const navigate = useNavigate();
  return (
    <ApplicationRecommendation
      key={`${data.key}/${Boolean(data.intake)}`}
      applicationKey={data.key}
      application={data.application}
      round={data.round}
      data={data.recommendation}
    >
      {({ editor, action, closeAction }) => (
        <ApplicationView
          round={data.round}
          application={data.application}
          intake={
            data.intake
              ? { data: data.intake, onDeleted: () => navigate(returnLocation ?? roundLocation) }
              : undefined
          }
          reviewData={data.reviews}
          tab={tab}
          onTabChange={onTabChange}
          recommendationAction={action}
          editor={editor}
          editorCloseAction={closeAction}
        />
      )}
    </ApplicationRecommendation>
  );
};
