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
import type { AiReviewWork } from "./use-ai-review-work";

/**
 * The manager's AI review beside the reviewer assessments: the latest run as a choice that opens
 * it in full, then the way to run another, or why one cannot be run.
 */
export const AiReviewOverview = ({
  work,
  onSelect,
  readOnly = false,
}: {
  work: AiReviewWork;
  /** Reveal the reference pane that shows the review, then open it. */
  onSelect: (id: string) => void;
  /** A page that accepts no work shows the saved reviews and offers no run. */
  readOnly?: boolean;
}) => {
  const { t } = useTranslation("aiReview");
  const { calendarDate } = useFormat();
  const latest = work.reviews[0];

  return (
    <PanelSection title={t("title")}>
      <Stack gap={3}>
        {latest ? (
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
        ) : (
          <Text as="p" variant="missing">
            {t("none")}
          </Text>
        )}
        {!readOnly && <AiReviewRun work={work} />}
      </Stack>
    </PanelSection>
  );
};

const AiReviewRun = ({ work }: { work: AiReviewWork }) => {
  // Held here because the button and the explanation never exist together: whether the button had
  // focus as it left decides whether the explanation that replaces it takes it.
  const buttonHadFocus = useRef(false);
  return work.availability === "available" ? (
    <RunControl
      work={work}
      onLeave={(hadFocus) => {
        buttonHadFocus.current = hadFocus;
      }}
    />
  ) : (
    <RunUnavailable
      availability={work.availability}
      takesFocus={() => {
        const takes = buttonHadFocus.current;
        buttonHadFocus.current = false;
        return takes;
      }}
    />
  );
};

/** Why a run is not offered, in visible text. Focus follows the run button it replaced, if it held focus. */
const RunUnavailable = ({
  availability,
  takesFocus,
}: {
  availability: Exclude<AiReviewWork["availability"], "available">;
  /** Whether the run button held focus when it left; asking resets it. */
  takesFocus: () => boolean;
}) => {
  const { t } = useTranslation("aiReview");
  const explanation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (takesFocus()) {
      explanation.current?.focus();
    }
  }, [takesFocus]);
  return (
    <div role="status" tabIndex={-1} ref={explanation}>
      <Text as="p" variant="supporting">
        {t(`availability.${availability}`)}
      </Text>
    </div>
  );
};

const RunFailure = ({ work }: { work: AiReviewWork }) => {
  const { t } = useTranslation("aiReview");
  const { failure } = work;
  if (!failure || failure.kind === "not_available") {
    return null;
  }
  return (
    <Notice
      appearance="inline"
      tone="danger"
      role="alert"
      actions={
        failure.kind === "unconfirmed" ? (
          <Button variant="quiet" isDisabled={work.pending} onPress={() => void work.refresh()}>
            {t("refresh")}
          </Button>
        ) : undefined
      }
    >
      {t(failure.kind)}
    </Notice>
  );
};

const RunControl = ({
  work,
  onLeave,
}: {
  work: AiReviewWork;
  /** Called as the button is removed, with whether it still held focus. */
  onLeave: (hadFocus: boolean) => void;
}) => {
  const { t } = useTranslation("aiReview");
  const { failure, pending, provider, reviews } = work;
  const button = useRef<HTMLButtonElement | null>(null);
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
      <RunFailure work={work} />
      <div>
        <Button
          ref={(element) => {
            // React detaches the button just before removing it, while focus is still readable.
            // Whoever holds focus then decides whether the explanation that replaces it takes it.
            if (element) {
              button.current = element;
            } else {
              onLeave(document.activeElement === button.current);
            }
          }}
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
