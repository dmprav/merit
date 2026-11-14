import { type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  ApplicationView as Application,
  ApplicationRoundContext,
} from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { ActionProvenance } from "@merit/ui/action-provenance";
import shellStyles from "@merit/ui/application-shell.module.css";
import { PersonIdentity } from "@merit/ui/person-identity";
import { StatusMessage } from "@merit/ui/status-message";

import type { RecommendationData } from "../../contracts/recommendations";
import { useRecommendation } from "../../controllers/recommendations/use-recommendation";
import styles from "../judgment.module.css";
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
  const { draft, saved, save, updateDraft, ready } = useRecommendation(
    applicationKey,
    application,
    data,
  );

  return (
    <>
      <RecommendationEditor
        key={applicationKey}
        application={application}
        round={round}
        disabled={data.disabled}
        ready={ready}
        draft={draft}
        onDraftChange={updateDraft}
        onSave={save}
        onClose={onClose}
      >
        {children}
      </RecommendationEditor>
      <StatusMessage
        message={saved ? t("editor.saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
        className={shellStyles.confirmation}
      />
    </>
  );
};

export const ApplicationRecommendationSummary = ({
  application,
  manager,
  action,
}: {
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
      <h2>{t("applications.recommendation")}</h2>
      <div className={styles.judgmentHeader}>
        <PersonIdentity
          name={recommendation?.author?.name ?? manager}
          className={styles.judgmentIdentity}
        />
        {action}
      </div>
      {recommendation ? (
        <div className={styles.judgmentBody}>
          <div className={styles.judgmentSummary}>
            <strong>{t(recommendationPositionKeys[recommendation.position])}</strong>
            {recommendation.position !== "Defer" && (
              <span>
                {t("applications.proposedAmount", { amount: money(recommendation.allocation) })}
              </span>
            )}
            {basis != null && (
              <span className={styles.judgmentBasis}>
                {basis !== application.version && (
                  <span className={styles.attentionDot} aria-hidden="true" />
                )}
                {t(basis !== application.version ? "workspace.earlierBasis" : "workspace.basis", {
                  version: basis,
                })}
              </span>
            )}
          </div>
          <p className={styles.prose}>{recommendation.reasoning}</p>
          {recommendation.recorded && (
            <span className={styles.meta}>{calendarDate(recommendation.recorded.date)}</span>
          )}
          {recommendation.author?.provenance && (
            <ActionProvenance value={recommendation.author.provenance} />
          )}
        </div>
      ) : (
        <p className={styles.meta}>{t("applications.notRecommended")}</p>
      )}
    </section>
  );
};
