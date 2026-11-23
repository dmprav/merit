import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SubmissionAnswers } from "@merit/applications-web/intake";
import { materialVersionSchema } from "@merit/applications/domain";
import { useFormat } from "@merit/i18n/format";
import { Attribution } from "@merit/ui/attribution";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Divider } from "@merit/ui/divider";
import { Stack, Reading } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { SectionHeader } from "@merit/ui/section-header";
import { Select } from "@merit/ui/select";
import { Tabs } from "@merit/ui/tabs";
import { Text } from "@merit/ui/text";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";
import { VisuallyHidden } from "@merit/ui/visually-hidden";

import {
  applicationHistorySnapshots,
  compareSubmissionAnswers,
  comparedHistoryEntries,
  submissionAnswersReordered,
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

/** The history region; its heading names the region for assistive technology. */
const HistoryFrame = ({ label, children }: { label: string; children: ReactNode }) => (
  <section className={styles.history} aria-label={label}>
    <Stack gap={6}>
      <VisuallyHidden as="h2">{label}</VisuallyHidden>
      {children}
    </Stack>
  </section>
);

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
  const last = snapshots.at(-1);

  const [selection, setSelection] = useState(() => ({
    from:
      initialFromVersion !== undefined && initialFromVersion !== last?.version
        ? initialFromVersion
        : (snapshots.at(-2)?.version ?? application.version),
    to: last?.version ?? application.version,
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
      <HistoryFrame label={t("history.title")}>
        <Notice tone="neutral">{t(missing.empty)}</Notice>
        <HistoricalApplication value={application} label={versionLabel(application.version)} />
      </HistoryFrame>
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
    <HistoryFrame label={t("history.title")}>
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
        <>
          <Notice tone="neutral">
            {t(missing.selected, {
              version: !after ? selection.to : selection.from,
            })}
          </Notice>
          {before && <HistoricalApplication value={before} label={labels.fromLabel} />}
          {after && <HistoricalApplication value={after} label={labels.toLabel} />}
        </>
      ) : (
        <>
          {entries.length > 0 && <RecordedUpdates entries={entries} />}
          <SnapshotComparison before={before} after={after} labels={labels} />
        </>
      )}
    </HistoryFrame>
  );
};

type SnapshotComparisonProps = {
  before: HistorySnapshot;
  after: HistorySnapshot;
  labels: { fromLabel: string; toLabel: string };
  includeRecord?: boolean;
};

export const SnapshotComparison = (props: SnapshotComparisonProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  return (
    <Tabs
      label={t("history.display")}
      defaultSelectedKey="changes"
      scrollBackwardLabel={t("common:scrollTabsBackward")}
      scrollForwardLabel={t("common:scrollTabsForward")}
      items={[
        {
          id: "changes",
          label: t("history.changes"),
          content: <SnapshotChanges {...props} />,
        },
        {
          id: "full",
          label: t("history.fullRecord"),
          content: (
            <div className={styles.snapshots}>
              <HistoricalApplication value={props.before} label={props.labels.fromLabel} />
              <HistoricalApplication value={props.after} label={props.labels.toLabel} />
            </div>
          ),
        },
      ]}
    />
  );
};

const SnapshotChanges = ({
  before,
  after,
  labels,
  includeRecord = false,
}: SnapshotComparisonProps) => {
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
    ...(includeRecord ? (["summary", "summaryAuthor", "intakeStatus"] as const) : []),
  ] as const;
  const answers =
    before.submission && after.submission
      ? compareSubmissionAnswers(before.submission.answers, after.submission.answers)
      : [];
  const reordered =
    before.submission &&
    after.submission &&
    submissionAnswersReordered(before.submission.answers, after.submission.answers);
  const hasChanges =
    reordered ||
    fields.some((field) => previous[field] !== current[field]) ||
    answers.some((answer) => answer.status !== "unchanged");

  return (
    <div className={styles.changes}>
      {!hasChanges && before.submission && after.submission && (
        <Text as="p" variant="missing">
          {t("history.noChanges")}
        </Text>
      )}
      {reordered && <Notice tone="neutral">{t("history.reordered")}</Notice>}
      {fields
        .filter((field) => previous[field] !== current[field])
        .map((field) => (
          <ComparisonSection
            key={field}
            label={t(`history.${field}`)}
            before={
              field === "intakeStatus" && previous[field]
                ? t(previous[field] === "ready" ? "intake.ready" : "intake.preparing")
                : previous[field]
            }
            after={
              field === "intakeStatus" && current[field]
                ? t(current[field] === "ready" ? "intake.ready" : "intake.preparing")
                : current[field]
            }
            {...labels}
          />
        ))}
      <SubmissionComparison before={before.submission} after={after.submission} labels={labels} />
    </div>
  );
};

const snapshotFacts = (
  snapshot: HistorySnapshot,
  { money, calendarDate, timestamp }: ReturnType<typeof useFormat>,
) => ({
  titleField: snapshot.title,
  summary: snapshot.summary ?? null,
  summaryAuthor: snapshot.summaryAuthor
    ? `${snapshot.summaryAuthor.name}, ${timestamp(snapshot.summaryAuthor.recordedAt)}`
    : null,
  intakeStatus: snapshot.intakeStatus ?? null,
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
      {compareSubmissionAnswers(before.answers, after.answers)
        .filter((answer) => answer.status !== "unchanged")
        .map((answer, index) => (
          <ComparisonSection
            key={index}
            label={
              answer.after?.question || answer.before?.question || t("history.untitledSection")
            }
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
  const presenceLabels = {
    added: "history.added",
    removed: "history.removed",
    changed: "history.changed",
  } as const;
  const statusLabel = presenceLabels[presence ?? "changed"];
  const missingLabels = {
    added: "history.notPresent",
    removed: "history.notPresent",
  } as const;
  const missingLabel = presence ? missingLabels[presence] : "history.unknown";
  const beforeValue = before ?? t(missingLabel);
  const afterValue = after ?? t(missingLabel);

  return (
    <section className={styles.section}>
      <SectionHeader
        level={3}
        title={label}
        aside={<Text variant="caption">{t(statusLabel)}</Text>}
      />
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
          emphasis
        />
      </div>
    </section>
  );
};

const ComparedValue = ({
  label,
  heading,
  showHeading,
  value,
  emphasis = false,
}: {
  label: string;
  heading?: string;
  showHeading: boolean;
  value: string;
  /** Marks the recorded side of the comparison. */
  emphasis?: boolean;
}) => (
  <Stack gap={3}>
    <Divider tone={emphasis ? "emphasis" : "default"} />
    <div>
      <Text variant="caption">{label}</Text>
      {showHeading && heading && (
        <Reading as="p">
          <strong>{heading}</strong>
        </Reading>
      )}
      <Reading as="p">{value}</Reading>
    </div>
  </Stack>
);

const RecordedUpdates = ({ entries }: { entries: readonly ApplicationHistoryEntry[] }) => {
  const { t } = useTranslation("fundingRounds");
  return (
    <Timeline label={t("history.recordedUpdates")}>
      {entries.flatMap((entry) => {
        if (!entry.before || !entry.after) {
          return [];
        }
        return (
          <TimelineEntry
            key={entry.revision}
            title={t("history.update", {
              from: entry.before.version,
              to: entry.after.version,
            })}
            attribution={
              <Attribution
                actor={entry.actor}
                provenance={entry.provenance}
                recordedAt={entry.recordedAt}
              />
            }
          >
            {entry.reason && (
              <Reading as="p" prose={false}>
                {entry.reason}
              </Reading>
            )}
          </TimelineEntry>
        );
      })}
    </Timeline>
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

export const HistoricalApplication = ({
  value,
  label,
}: {
  value: HistorySnapshot;
  label: string;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { money, calendarDate } = useFormat();

  return (
    <section aria-label={label} className={styles.snapshot}>
      <SectionHeader level={3} title={label} />
      <Text as="p" variant="emphasis">
        {value.title}
      </Text>
      <DescriptionList layout="rows">
        <DescriptionListItem label={t("history.intakeStatus")}>
          {value.intakeStatus
            ? t(value.intakeStatus === "ready" ? "intake.ready" : "intake.preparing")
            : t("history.unknown")}
        </DescriptionListItem>
        <DescriptionListItem label={t("intake.applicant")}>
          {value.submission?.organization ?? t("intake.notKnown")}
        </DescriptionListItem>
        <DescriptionListItem label={t("intake.requested")}>
          {value.requested ? money(value.requested) : t("intake.notKnown")}
        </DescriptionListItem>
        {value.submission?.submittedOn && (
          <DescriptionListItem label={t("history.submittedOn")}>
            {calendarDate(value.submission.submittedOn)}
          </DescriptionListItem>
        )}
        {value.submission?.projectPeriod && (
          <DescriptionListItem label={t("evidence.projectPeriod")}>
            {value.submission.projectPeriod}
          </DescriptionListItem>
        )}
        {value.submission?.contact && (
          <DescriptionListItem label={t("intake.contact")}>
            {value.submission.contact}
          </DescriptionListItem>
        )}
        {value.submission?.contactEmail && (
          <DescriptionListItem label={t("history.contactEmail")}>
            {value.submission.contactEmail}
          </DescriptionListItem>
        )}
      </DescriptionList>
      <HistoricalSummary value={value} />
      <div className={styles.answers}>
        {value.submission ? (
          <SubmissionAnswers answers={value.submission.answers} headingLevel={4} />
        ) : (
          <p>{t("history.noSubmission")}</p>
        )}
      </div>
    </section>
  );
};

const HistoricalSummary = ({ value }: { value: HistorySnapshot }) => {
  const { t } = useTranslation("fundingRounds");
  return value.summaryAuthor || value.summary ? (
    <Stack as="section" gap={4}>
      <Divider />
      <DescriptionList>
        <DescriptionListItem label={t("history.summary")}>
          <Stack gap={2}>
            <Attribution
              actor={value.summaryAuthor?.name ?? null}
              recordedAt={value.summaryAuthor?.recordedAt}
            />
            <Reading as="p">{value.summary}</Reading>
          </Stack>
        </DescriptionListItem>
      </DescriptionList>
    </Stack>
  ) : null;
};
