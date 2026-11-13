import { useState } from "react";
import { useTranslation } from "react-i18next";

import { materialVersionSchema } from "@merit/applications/domain";
import { useFormat } from "@merit/i18n/format";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Select } from "@merit/ui/select";

import {
  applicationHistorySnapshots,
  compareSubmissionAnswers,
  comparedHistoryEntries,
  type ApplicationHistoryEntry,
  type HistorySnapshot,
} from "./application-history-model";
import styles from "./application-history.module.css";

type ApplicationHistoryProps = {
  hasMore?: boolean;
  application: HistorySnapshot;
  history: readonly ApplicationHistoryEntry[];
  initialFromVersion?: number;
};

/** Key by application and requested basis when opening a different review's comparison. */
export const ApplicationHistory = ({
  application,
  history,
  initialFromVersion,
  hasMore = false,
}: ApplicationHistoryProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const missing = hasMore ? missingHistoryMessages.partial : missingHistoryMessages.complete;
  const snapshots = applicationHistorySnapshots(application, history);
  const last = snapshots.at(-1)!;

  const [selection, setSelection] = useState(() => ({
    from:
      initialFromVersion !== undefined && initialFromVersion !== last.version
        ? initialFromVersion
        : (snapshots.at(-2)?.version ?? application.version),
    to: last.version,
  }));

  const before = snapshots.find((snapshot) => snapshot.version === selection.from);
  const after = snapshots.find((snapshot) => snapshot.version === selection.to);

  const versionLabel = (version: number) =>
    t(version === application.version ? "history.currentVersion" : "history.version", { version });

  const entries = comparedHistoryEntries(history, selection.from, selection.to);
  if (
    snapshots.length < 2 &&
    (initialFromVersion === undefined || initialFromVersion === application.version)
  ) {
    return (
      <Stack as="section" gap={6} className={styles.history} aria-label={t("history.title")}>
        <h2 className={styles.accessibleHeading}>{t("history.title")}</h2>
        <Notice tone="neutral">{t(missing.empty)}</Notice>
      </Stack>
    );
  }

  const fromItems: { id: string; label: string }[] = snapshots.slice(0, -1).map((snapshot) => ({
    id: String(snapshot.version),
    label: versionLabel(snapshot.version),
  }));
  if (!fromItems.some((item) => item.id === String(selection.from))) {
    fromItems.push({
      id: String(selection.from),
      label: t(missing.version, {
        version: selection.from,
      }),
    });
  }

  const labels = { fromLabel: versionLabel(selection.from), toLabel: versionLabel(selection.to) };

  return (
    <Stack as="section" gap={6} className={styles.history} aria-label={t("history.title")}>
      <h2 className={styles.accessibleHeading}>{t("history.title")}</h2>
      <div className={styles.controls}>
        <Select
          label={t("history.from")}
          selectedKey={String(selection.from)}
          items={fromItems}
          onSelectionChange={(key) => {
            const from = Number(key);
            const to =
              from < selection.to
                ? selection.to
                : (snapshots.find((snapshot) => snapshot.version > from)?.version ?? selection.to);
            setSelection({ from, to });
          }}
        />
        <Select
          label={t("history.to")}
          selectedKey={String(selection.to)}
          items={snapshots
            .filter(
              (snapshot) => snapshot.version > selection.from || snapshot.version === selection.to,
            )
            .map((snapshot) => ({
              id: String(snapshot.version),
              label: versionLabel(snapshot.version),
            }))}
          onSelectionChange={(key) =>
            setSelection({ ...selection, to: materialVersionSchema.parse(Number(key)) })
          }
        />
      </div>
      {!before || !after || selection.from >= selection.to ? (
        <Notice tone="neutral">
          {t(missing.selected, {
            version: !after ? selection.to : selection.from,
          })}
        </Notice>
      ) : (
        <>
          {entries.length > 0 && <RecordedUpdates entries={entries} />}
          <SnapshotComparison before={before} after={after} labels={labels} />
        </>
      )}
    </Stack>
  );
};

const SnapshotComparison = ({
  before,
  after,
  labels,
}: {
  before: HistorySnapshot;
  after: HistorySnapshot;
  labels: { fromLabel: string; toLabel: string };
}) => {
  const { t } = useTranslation("fundingRounds");
  const format = useFormat();
  const previous = snapshotFacts(before, format);
  const current = snapshotFacts(after, format);
  const fields = [
    "titleField",
    "applicant",
    "requested",
    "contact",
    "contactEmail",
    "projectPeriod",
    "submittedOn",
  ] as const;

  return (
    <>
      {fields
        .filter((field) => field === "requested" || previous[field] !== current[field])
        .map((field) => (
          <ComparisonSection
            key={field}
            label={t(`history.${field}`)}
            before={previous[field]}
            after={current[field]}
            {...labels}
          />
        ))}
      <SubmissionComparison before={before.submission} after={after.submission} labels={labels} />
    </>
  );
};

const snapshotFacts = (
  snapshot: HistorySnapshot,
  { money, calendarDate }: ReturnType<typeof useFormat>,
) => ({
  titleField: snapshot.title,
  applicant: snapshot.submission?.organization ?? null,
  requested: snapshot.requested === null ? null : money(snapshot.requested),
  contact: snapshot.submission?.contact ?? null,
  contactEmail: snapshot.submission?.contactEmail ?? null,
  projectPeriod: snapshot.submission?.projectPeriod ?? null,
  submittedOn: snapshot.submission?.submittedOn
    ? calendarDate(snapshot.submission.submittedOn)
    : null,
});

const SubmissionComparison = ({
  before,
  after,
  labels,
}: {
  before: HistorySnapshot["submission"];
  after: HistorySnapshot["submission"];
  labels: { fromLabel: string; toLabel: string };
}) => {
  const { t } = useTranslation("fundingRounds");
  if (!before || !after) {
    return <Notice tone="neutral">{t("history.noSubmission")}</Notice>;
  }

  return (
    <>
      {compareSubmissionAnswers(before.answers, after.answers).map((answer, index) => (
        <ComparisonSection
          key={index}
          label={answer.after?.question || answer.before?.question || t("history.untitledSection")}
          beforeHeading={answer.before?.question}
          afterHeading={answer.after?.question}
          before={answer.before?.response ?? null}
          after={answer.after?.response ?? null}
          presence={
            answer.status === "added" || answer.status === "removed" ? answer.status : undefined
          }
          {...labels}
        />
      ))}
    </>
  );
};

const ComparisonSection = ({
  label,
  before,
  after,
  fromLabel,
  toLabel,
  presence,
  beforeHeading,
  afterHeading,
}: {
  label: string;
  before: string | null;
  after: string | null;
  fromLabel: string;
  toLabel: string;
  presence?: "added" | "removed";
  beforeHeading?: string;
  afterHeading?: string;
}) => {
  const { t } = useTranslation("fundingRounds");
  const renamed = beforeHeading !== afterHeading;
  const unchanged = before === after && !renamed;
  const presenceLabels = {
    added: "history.added",
    removed: "history.removed",
  } as const;
  const statusLabel = unchanged ? "history.unchanged" : presence && presenceLabels[presence];
  const missingLabels = {
    added: "history.notPresent",
    removed: "history.notPresent",
  } as const;
  const missingLabel = presence ? missingLabels[presence] : "history.unknown";
  const beforeValue = before ?? t(missingLabel);
  const afterValue = after ?? t(missingLabel);

  return (
    <section className={styles.section} data-unchanged={unchanged || undefined}>
      <div className={styles.sectionHeading}>
        <h3>{label}</h3>
        {statusLabel && <span className={styles.meta}>{t(statusLabel)}</span>}
      </div>
      {unchanged ? (
        <p className={styles.prose}>{after ?? t("history.unknown")}</p>
      ) : (
        <div className={styles.comparison}>
          <ComparedValue
            label={fromLabel}
            heading={beforeHeading}
            showHeading={renamed}
            value={beforeValue}
          />
          <ComparedValue
            label={toLabel}
            heading={afterHeading}
            showHeading={renamed}
            value={afterValue}
          />
        </div>
      )}
    </section>
  );
};

const ComparedValue = ({
  label,
  heading,
  showHeading,
  value,
}: {
  label: string;
  heading?: string;
  showHeading: boolean;
  value: string;
}) => (
  <div>
    <span className={styles.meta}>{label}</span>
    {showHeading && heading && (
      <p className={styles.prose}>
        <strong>{heading}</strong>
      </p>
    )}
    <p className={styles.prose}>{value}</p>
  </div>
);

const RecordedUpdates = ({ entries }: { entries: readonly ApplicationHistoryEntry[] }) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const { calendarDate } = useFormat();
  return (
    <Stack as="ol" className={styles.events} aria-label={t("history.recordedUpdates")}>
      {entries.map((entry) => (
        <li key={entry.revision}>
          <div className={styles.eventHeading}>
            <h3>
              {t("history.update", {
                from: entry.before!.version,
                to: entry.after!.version,
              })}
            </h3>
            <Inline align="baseline" gap={3} className={styles.meta}>
              <span>
                {t("common:recordedBy", {
                  name: entry.actor ?? t("preparation.unknownPerson"),
                })}
              </span>
              <ActionProvenance value={entry.provenance} />
              <time dateTime={entry.recordedAt}>{calendarDate(entry.recordedAt.slice(0, 10))}</time>
            </Inline>
          </div>
          {entry.reason && <p className={styles.prose}>{entry.reason}</p>}
        </li>
      ))}
    </Stack>
  );
};

const missingHistoryMessages = {
  partial: {
    empty: "history.loadEarlierSnapshot",
    version: "history.unloadedVersion",
    selected: "history.loadEarlierSnapshot",
  },
  complete: {
    empty: "history.noEarlierSnapshot",
    version: "history.unavailableVersion",
    selected: "history.missingSnapshot",
  },
} as const;
