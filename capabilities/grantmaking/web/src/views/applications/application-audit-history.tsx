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
  const { calendarDate } = useFormat();

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
            {entry.action === "application.withdraw" && entry.after?.withdrawal && (
              <p>
                {t("intake.withdrawnOn", {
                  date: calendarDate(entry.after.withdrawal.withdrawnOn),
                })}
              </p>
            )}
            {entry.reason && <p className={styles.reading}>{entry.reason}</p>}
            {(entry.action === "application.created" ||
              entry.action === "application.material_changed" ||
              entry.action === "application.marked_ready" ||
              entry.action === "application.revision_recorded" ||
              entry.action === "application.correction_recorded" ||
              entry.action === "application.summary_changed" ||
              entry.action === "application.contact_changed") && (
              <>
                {entry.before &&
                  (entry.action === "application.revision_recorded" ||
                    entry.action === "application.correction_recorded" ||
                    entry.action === "application.summary_changed" ||
                    entry.action === "application.contact_changed") && (
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
