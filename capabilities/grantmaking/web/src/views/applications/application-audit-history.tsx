import { useTranslation } from "react-i18next";

import type { IntakeState } from "@merit/applications-web/contracts";
import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Inline } from "@merit/ui/layout";

import styles from "./application-audit-history.module.css";

/** Complete recorded intake activity, including changes within a submission version. */
export const ApplicationAuditHistory = ({ history }: { history: IntakeState["history"] }) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const { formatLocale } = useLocaleSettings();

  return (
    <details className={styles.history}>
      <summary>{t("intake.history")}</summary>
      {history.length === 0 && <p>{t("intake.unrecordedHistory")}</p>}
      <ol>
        {history.map((entry) => (
          <li key={entry.revision}>
            <p>
              <strong>{t(historyLabel(entry.action))}</strong>
            </p>
            <Inline align="baseline" gap={3}>
              <span>
                {t("common:recordedBy", { name: entry.actor ?? t("preparation.unknownPerson") })}
              </span>
              <ActionProvenance value={entry.provenance} />
              <time dateTime={entry.recordedAt}>
                {new Date(entry.recordedAt).toLocaleString(formatLocale, { timeZone: "UTC" })} UTC
              </time>
            </Inline>
            {entry.reason && <p className={styles.reading}>{entry.reason}</p>}
            {(entry.action === "create" ||
              entry.action === "save_content" ||
              entry.action === "mark_ready" ||
              entry.action === "revision" ||
              entry.action === "correction" ||
              entry.action === "details") && (
              <>
                {entry.before &&
                  (entry.action === "revision" ||
                    entry.action === "correction" ||
                    entry.action === "details") && (
                    <HistoricalApplication
                      value={entry.before}
                      label={t("intake.previousVersion")}
                    />
                  )}
                {entry.after && (
                  <HistoricalApplication value={entry.after} label={t("intake.recordedVersion")} />
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
};

const historyLabels = {
  create: "intake.eventCreate",
  save_content: "intake.eventContent",
  mark_ready: "intake.eventReady",
  start_revision: "intake.eventStart",
  save_revision: "intake.eventDraft",
  discard_revision: "intake.eventDiscard",
  revision: "intake.eventRevision",
  correction: "intake.eventCorrection",
  details: "intake.eventDetails",
} as const;

const historyLabel = (action: string) =>
  historyLabels[action as keyof typeof historyLabels] ?? "intake.history";

const HistoricalApplication = ({
  value,
  label,
}: {
  value: NonNullable<IntakeState["history"][number]["after"]>;
  label: string;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { money } = useFormat();

  return (
    <details>
      <summary>
        {label} ({t("intake.version", { version: value.version })})
      </summary>
      <p>
        <strong>{value.title}</strong>
      </p>
      <DescriptionList>
        <DescriptionListItem label={t("intake.applicant")}>
          {value.submission?.organization || t("intake.notKnown")}
        </DescriptionListItem>
        <DescriptionListItem label={t("intake.requested")}>
          {value.requested ? money(decodeMoney(value.requested)) : t("intake.notKnown")}
        </DescriptionListItem>
      </DescriptionList>
      {value.submission?.projectPeriod && (
        <p>
          {t("evidence.projectPeriod")}: {value.submission.projectPeriod}
        </p>
      )}
      {value.submission?.contact && (
        <p>
          {t("intake.contact")}: {value.submission.contact} {value.submission.contactEmail}
        </p>
      )}
      {value.summaryAuthor && (
        <p className={styles.reading}>
          {t("intake.summaryBy", { name: value.summaryAuthor.name })}: {value.summary}
        </p>
      )}
      {value.submission?.answers.map((answer, index) => (
        <div key={index} className={styles.reading}>
          <strong>{answer.question}</strong>
          <p>{answer.response}</p>
        </div>
      ))}
    </details>
  );
};
