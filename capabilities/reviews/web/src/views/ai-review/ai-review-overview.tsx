import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { Button } from "@merit/ui/button";
import { JudgmentChoice } from "@merit/ui/judgment";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PanelSection } from "@merit/ui/panel-section";
import { Text } from "@merit/ui/text";

import { AiReviewBasis } from "./ai-review-basis";
import { AiReviewSummary } from "./ai-review-summary";
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
  const { t } = useTranslation("aiReview");
  const { calendarDate } = useFormat();
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
              authorIcon="assistant"
              meta={t("entryMeta", {
                date: calendarDate(latest.recordedAt.slice(0, 10)),
                model: latest.model,
              })}
              summary={<AiReviewSummary review={latest} />}
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
  const explanation = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  // A refused run replaces the focused button with its explanation: focus follows it, and a screen
  // reader reads it. Only a run that was just asked for moves focus.
  useEffect(() => {
    if (pending || !requested.current) {
      return;
    }
    requested.current = false;
    if (availability !== "available") {
      explanation.current?.focus();
    }
  }, [availability, pending]);
  if (availability !== "available") {
    return (
      <div role="status" tabIndex={-1} ref={explanation}>
        <Text as="p" variant="supporting">
          {t(`availability.${availability}`)}
        </Text>
      </div>
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
          onPress={
            pending
              ? undefined
              : () => {
                  requested.current = true;
                  void work.run();
                }
          }
        >
          {label}
        </Button>
      </div>
    </>
  );
};
