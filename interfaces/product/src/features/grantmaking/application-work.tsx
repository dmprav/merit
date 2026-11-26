import { useNavigate, type LinkOptions } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ApplicationDecision } from "@merit/decisions-web/work";
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
  const { t } = useTranslation("committeeDecisions");
  return (
    <ApplicationDecision
      key={`${data.key}/${Boolean(data.intake)}/decision`}
      applicationKey={data.key}
      application={data.application}
      round={data.round}
      data={data.decision}
    >
      {(decision) => (
        <ApplicationRecommendation
          key={`${data.key}/${Boolean(data.intake)}`}
          applicationKey={data.key}
          application={data.application}
          round={data.round}
          data={data.recommendation}
        >
          {(recommendation) => (
            <ApplicationView
              round={data.round}
              application={data.application}
              intake={
                data.intake
                  ? {
                      data: data.intake,
                      onDeleted: () => navigate(returnLocation ?? roundLocation),
                    }
                  : undefined
              }
              reviewData={data.reviews}
              tab={tab}
              onTabChange={onTabChange}
              recommendationAction={recommendation.action}
              decisionVersions={data.decision.versions}
              decisionAction={decision.action}
              editor={decision.editor ?? recommendation.editor}
              editorTitle={decision.editor ? t("section.title") : undefined}
              editorJumpLabel={decision.editor ? t("editor.jumpTo") : undefined}
              editorCloseAction={
                decision.editor ? decision.closeAction : recommendation.closeAction
              }
            />
          )}
        </ApplicationRecommendation>
      )}
    </ApplicationDecision>
  );
};
