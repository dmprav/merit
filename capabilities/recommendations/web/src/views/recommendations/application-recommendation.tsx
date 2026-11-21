import { type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  ApplicationView as Application,
  ApplicationRoundContext,
} from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { Judgment } from "@merit/ui/judgment";
import { Reading } from "@merit/ui/layout";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { useEventToast } from "@merit/ui/toast";

import type { RecommendationData } from "../../contracts/recommendations";
import { useRecommendation } from "../../controllers/recommendations/use-recommendation";
import styles from "../application-recommendation.module.css";
import { recommendationPositionKeys } from "./messages";
import { RecommendationEditor } from "./recommendation-editor";

type ApplicationRecommendationProps = Pick<
  ComponentProps<typeof RecommendationEditor>,
  "application" | "round" | "onClose" | "children"
> & {
  applicationKey: string;
  data: RecommendationData;
};

export const ApplicationRecommendation = ({
  applicationKey,
  application,
  round,
  data,
  onClose,
  children,
}: ApplicationRecommendationProps) => {
  const { t } = useTranslation("fundingRecommendations");
  const { draft, conflict, draftReset, saved, save, updateDraft, keepDraft, loadLatest, ready } =
    useRecommendation(applicationKey, application, data);
  useEventToast(saved, { tone: "success", message: t("editor.saved") });

  return (
    <>
      <RecommendationEditor
        key={applicationKey}
        application={application}
        round={round}
        disabled={data.disabled}
        ready={ready}
        draft={draft}
        conflict={conflict}
        draftReset={draftReset}
        onDraftChange={updateDraft}
        onKeepDraft={keepDraft}
        onLoadLatest={loadLatest}
        onSave={save}
        onClose={onClose}
      >
        {children}
      </RecommendationEditor>
    </>
  );
};

export const ApplicationRecommendationSummary = ({
  application,
  manager,
  action,
  onInspectVersion,
}: {
  onInspectVersion?: (version: number) => void;
  application: Application;
  manager: ApplicationRoundContext["manager"];
  action?: ReactNode;
}) => {
  const { t } = useTranslation("fundingRecommendations");
  const { money, calendarDate } = useFormat();
  const recommendation = application.managerRecommendation;
  const basis = recommendation?.recorded?.applicationVersion;
  if (application.intakeStatus === "in_preparation" && !recommendation) {
    return action;
  }

  return (
    <section className={styles.recommendationSummary} aria-label={t("applications.recommendation")}>
      <SectionHeader title={t("applications.recommendation")} emphasis="quiet" />
      <Judgment
        author={recommendation?.author?.name ?? manager}
        meta={
          recommendation && (
            <>
              {recommendation.recorded && calendarDate(recommendation.recorded.date)}
              {recommendation.author?.provenance && (
                <ActionProvenance value={recommendation.author.provenance} />
              )}
            </>
          )
        }
        action={action}
        summary={
          recommendation && (
            <>
              <strong>{t(recommendationPositionKeys[recommendation.position])}</strong>
              {recommendation.position !== "Defer" && (
                <span>
                  {t("applications.proposedAmount", { amount: money(recommendation.allocation) })}
                </span>
              )}
            </>
          )
        }
        basis={
          // The current version needs no note; an earlier or unknown basis qualifies the position.
          recommendation &&
          basis !== application.version && (
            <>
              <span>
                {basis == null
                  ? t("workspace.basisUnknown")
                  : t("workspace.earlierBasis", { version: basis })}
              </span>
              {basis != null && onInspectVersion && (
                <Button variant="quiet" onPress={() => onInspectVersion(basis)}>
                  {t("workspace.compareChanges")}
                </Button>
              )}
            </>
          )
        }
      >
        {recommendation && (
          <>
            <Reading prose={false} as="p">
              {recommendation.reasoning}
            </Reading>
          </>
        )}
      </Judgment>
      {!recommendation && (
        <Text as="p" variant="missing">
          {t("applications.notRecommended")}
        </Text>
      )}
    </section>
  );
};
