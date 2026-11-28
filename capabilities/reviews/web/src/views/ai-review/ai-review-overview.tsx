import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import { Button } from "@merit/ui/button";
import { JudgmentChoice } from "@merit/ui/judgment";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PanelSection } from "@merit/ui/panel-section";
import { Text } from "@merit/ui/text";

import { reviewPositionKeys } from "../reviews/assessment-outcome";
import { AiReviewBasis } from "./ai-review-basis";
import styles from "./ai-review.module.css";
import type { AiReviewWork } from "./use-ai-review-work";

/**
 * The manager's AI review beside the reviewer assessments: the latest run as a choice that opens
 * it in full, then the way to run another, or why one cannot be run.
 */
export const AiReviewOverview = ({
  work,
  onSelect,
}: {
  work: AiReviewWork;
  /** Reveal the reference pane that shows the review, then open it. */
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation(["aiReview", "reviewGrant"]);
  const { money, calendarDate } = useFormat();
  const latest = work.reviews[0];

  return (
    <PanelSection title={t("title")}>
      <Stack gap={3}>
        {latest ? (
          <div className={styles.entry}>
            <JudgmentChoice
              ref={(element) => work.reading.registerTrigger(latest.id, element)}
              onPress={() => onSelect(latest.id)}
              author={t("author")}
              meta={t("entryMeta", {
                date: calendarDate(latest.recordedAt.slice(0, 10)),
                model: latest.model,
              })}
              summary={
                <>
                  <strong>{t(reviewPositionKeys[latest.position], { ns: "reviewGrant" })}</strong>
                  <span>{t("proposed", { amount: money(decodeMoney(latest.amount)) })}</span>
                </>
              }
              basis={<AiReviewBasis review={latest} />}
            />
          </div>
        ) : (
          <Text as="p" variant="missing">
            {t("none")}
          </Text>
        )}
        <AiReviewRun work={work} />
      </Stack>
    </PanelSection>
  );
};

const AiReviewRun = ({ work }: { work: AiReviewWork }) => {
  const { t } = useTranslation("aiReview");
  const { availability, failure, pending, provider, reviews } = work;
  if (availability !== "available") {
    return (
      <Text as="p" variant="supporting">
        {t(`availability.${availability}`)}
      </Text>
    );
  }
  const latest = reviews[0];
  // One button keeps its place, and focus, through a run and a retry.
  const label = pending
    ? t("running")
    : failure?.kind === "failed"
      ? t("tryAgain")
      : t(latest ? "runAgain" : "run");
  // A run is the main next step until the latest review is current.
  const variant = latest?.freshness === "current" ? "quiet" : "secondary";
  return (
    <>
      {provider && !pending && (
        <Text as="p" variant="supporting">
          {t("sends", { provider: provider.provider, model: provider.model })}
        </Text>
      )}
      {work.running && (
        <Text as="p" variant="supporting">
          <span role="status">{t("runningStatus")}</span>
        </Text>
      )}
      {failure && failure.kind !== "not_available" && (
        <Notice
          appearance="inline"
          tone="danger"
          role="alert"
          actions={
            failure.kind === "unconfirmed" ? (
              <Button variant="quiet" isDisabled={pending} onPress={() => void work.refresh()}>
                {t("refresh")}
              </Button>
            ) : undefined
          }
        >
          {t(failure.kind)}
        </Notice>
      )}
      <div>
        <Button
          variant={variant}
          alignment="start"
          aria-busy={pending}
          aria-disabled={pending}
          onPress={pending ? undefined : () => void work.run()}
        >
          {label}
        </Button>
      </div>
    </>
  );
};
