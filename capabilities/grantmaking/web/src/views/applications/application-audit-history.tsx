import { useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";

import type { IntakeState } from "@merit/applications-web/contracts";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import { Attribution } from "@merit/ui/attribution";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Reading } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { useReadingNavigation } from "@merit/ui/reference-workspace";
import { SectionHeader } from "@merit/ui/section-header";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";

import styles from "./application-audit-history.module.css";
import { HistoricalApplication, SnapshotComparison } from "./application-history";
import type { HistorySnapshot } from "./application-history-model";

/** Complete recorded intake activity, including changes within a submission version. */
export const ApplicationAuditHistory = ({
  history,
  onInspect,
}: {
  history: readonly IntakeState["history"][number][];
  onInspect?: (inspecting: boolean) => void;
}) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const { calendarDate } = useFormat();
  const {
    destination: selectedRevision,
    root,
    heading,
    open,
    back,
  } = useReadingNavigation<number>();
  const selected = history.find((entry) => entry.revision === selectedRevision);
  const triggers = useRef(new Map<number, HTMLButtonElement>());

  if (selected) {
    return (
      <HistoricalChange
        entry={selected}
        rootRef={root}
        headingRef={heading}
        onBack={() => {
          back();
          onInspect?.(false);
        }}
      />
    );
  }

  return (
    <section ref={root} className={styles.history} aria-label={t("intake.history")}>
      <SectionHeader title={t("intake.history")} />
      {history.length === 0 && <p>{t("intake.unrecordedHistory")}</p>}
      <Timeline>
        {history
          .toSorted((left, right) => right.revision - left.revision)
          .map((entry) => (
            <TimelineEntry
              key={entry.revision}
              title={t(historyLabel(entry.action))}
              attribution={
                <Attribution
                  actor={entry.actor}
                  provenance={entry.provenance}
                  recordedAt={entry.recordedAt}
                />
              }
            >
              {entry.action === "application.withdraw" && entry.after?.withdrawal && (
                <p>
                  {t("intake.withdrawnOn", {
                    date: calendarDate(entry.after.withdrawal.withdrawnOn),
                  })}
                </p>
              )}
              {entry.reason && (
                <Reading as="p" prose={false}>
                  {entry.reason}
                </Reading>
              )}
              {inspectableActions.has(entry.action) && (entry.before || entry.after) && (
                <Button
                  variant="quiet"
                  alignment="start"
                  ref={(element) => {
                    if (element) {
                      triggers.current.set(entry.revision, element);
                    } else {
                      triggers.current.delete(entry.revision);
                    }
                  }}
                  onPress={() => {
                    open(entry.revision, () => triggers.current.get(entry.revision) ?? null);
                    onInspect?.(true);
                  }}
                >
                  {t("history.inspectEvent")}
                  <Icon name="right" />
                </Button>
              )}
            </TimelineEntry>
          ))}
      </Timeline>
    </section>
  );
};

const HistoricalChange = ({
  entry,
  rootRef,
  headingRef,
  onBack,
}: {
  entry: IntakeState["history"][number];
  rootRef: Ref<HTMLElement>;
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
}) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  return (
    <section ref={rootRef} className={styles.history} aria-label={t("intake.history")}>
      <Button variant="quiet" alignment="start" onPress={onBack}>
        <Icon name="left" />
        {t("history.backEvents")}
      </Button>
      <SectionHeader title={t(historyLabel(entry.action))} headingRef={headingRef} />
      <Attribution
        actor={entry.actor}
        provenance={entry.provenance}
        recordedAt={entry.recordedAt}
      />
      {entry.reason && (
        <Reading as="p" prose={false}>
          {entry.reason}
        </Reading>
      )}
      {entry.before && entry.after ? (
        <SnapshotComparison
          before={historySnapshot(entry.before)}
          after={historySnapshot(entry.after)}
          labels={{
            fromLabel: t("history.previousRecord", { version: entry.before.version }),
            toLabel: t("history.recordedRecord", { version: entry.after.version }),
          }}
          includeRecord
        />
      ) : (
        <>
          <Notice tone="neutral">{t("history.missingEventSnapshot")}</Notice>
          {entry.before && (
            <HistoricalApplication
              value={historySnapshot(entry.before)}
              label={t("history.previousRecord", { version: entry.before.version })}
            />
          )}
          {entry.after && (
            <HistoricalApplication
              value={historySnapshot(entry.after)}
              label={t("history.recordedRecord", { version: entry.after.version })}
            />
          )}
        </>
      )}
    </section>
  );
};

const historySnapshot = (
  value: NonNullable<IntakeState["history"][number]["after"]>,
): HistorySnapshot => ({
  ...value,
  requested: value.requested === null ? null : decodeMoney(value.requested),
});

const inspectableActions = new Set([
  "application.created",
  "application.material_changed",
  "application.marked_ready",
  "application.revision_recorded",
  "application.correction_recorded",
  "application.summary_changed",
  "application.contact_changed",
]);

const historyLabels = {
  "application.contact_changed": "intake.eventDetails",
  "application.created": "intake.eventCreate",
  "application.material_changed": "intake.eventContent",
  "application.marked_ready": "intake.eventReady",
  "application_working_revision.started": "intake.eventStart",
  "application_working_revision.updated": "intake.eventDraft",
  "application_working_revision.discarded": "intake.eventDiscard",
  "application.revision_recorded": "intake.eventRevision",
  "application.correction_recorded": "intake.eventCorrection",
  "application.summary_changed": "intake.eventDetails",
  "application.withdraw": "intake.eventWithdraw",
  "application.reinstate": "intake.eventReinstate",
} as const;

const historyLabel = (action: string) =>
  historyLabels[action as keyof typeof historyLabels] ?? "intake.history";
