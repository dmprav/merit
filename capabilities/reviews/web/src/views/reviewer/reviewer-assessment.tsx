import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConflictBanner } from "@merit/forms";
import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { ReviewerPage } from "@merit/reviews/api";
import type { ReviewerSubmissionProblem } from "@merit/reviews/domain";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { MoneyField } from "@merit/ui/money-field";
import { Notice } from "@merit/ui/notice";
import { WorkPane } from "@merit/ui/reference-workspace";
import { SectionHeader } from "@merit/ui/section-header";
import { Select } from "@merit/ui/select";
import { StatusMessage } from "@merit/ui/status-message";
import { TextField } from "@merit/ui/text-field";
import { Tooltip } from "@merit/ui/tooltip";

import { reconcileObservations } from "../../controllers/reviews/observations";
import { AssessmentOutcome } from "../reviews/assessment-outcome";
import { ReviewerFeedback, type ReviewerWork } from "./reviewer-feedback";
import styles from "./reviewer.module.css";

type Draft = NonNullable<ReviewerWork["draft"]>;

type Criteria = NonNullable<ReviewerPage["criteria"]>;

const fundingPositions = new Set(["Fund", "Fund with a condition"]);

/** The reviewer's own work: writing, amending, and reading what they submitted. */
export const ReviewerAssessment = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const { page } = work;
  const writing = Boolean(work.draft) && (!page.assessment || work.amending);
  const form = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);

  // Once feedback has rendered, move to the first field that prevents submission.
  useEffect(() => {
    if (attempt) {
      form.current?.querySelector<HTMLElement>("[data-invalid-focus-target]")?.focus();
    }
  }, [attempt]);

  return (
    <WorkPane
      as="section"
      label={t("assessment")}
      title={t("assessment")}
      titleActions={!writing && page.assessment && <AmendmentTrigger work={work} />}
      footer={
        writing && (
          <ReviewerSubmitActions work={work} onInvalid={() => setAttempt((value) => value + 1)} />
        )
      }
    >
      <SubmissionConfirmation page={page} />
      <div ref={form}>
        <Stack gap={5}>
          <AssessmentRequest assignment={page.assignment} />
          {writing ? <ReviewerDraftForm work={work} /> : <SubmittedAssessment work={work} />}
          <EarlierVersions page={page} />
        </Stack>
      </div>
    </WorkPane>
  );
};

const AssessmentRequest = ({ assignment }: { assignment: ReviewerPage["assignment"] }) => {
  const { t } = useTranslation("reviewer");
  const format = useFormat();
  return (
    <Stack gap={1} className={styles.hint}>
      <p>{t("requestedBy", { name: assignment.managerName })}</p>
      <p className={styles.responseDate}>
        {assignment.dueDate
          ? t("dueOn", { date: format.calendarDate(assignment.dueDate) })
          : t("noDue")}
      </p>
    </Stack>
  );
};

const AmendmentTrigger = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const label = t(work.amendmentDraft ? "resumeAmendment" : "startAmendment");
  return (
    <Tooltip content={label}>
      <Button
        variant="quiet"
        size="small"
        iconOnly
        aria-label={label}
        data-draft={work.amendmentDraft || undefined}
        onPress={work.startAmendment}
      >
        <Icon name="edit" />
      </Button>
    </Tooltip>
  );
};

/** Confirms each new submitted version once, after the page has reloaded it. */
const SubmissionConfirmation = ({ page }: { page: ReviewerPage }) => {
  const { t } = useTranslation("reviewer");
  const versions = page.assessment?.versions.length ?? 0;
  const [seen, setSeen] = useState(versions);
  const [event, setEvent] = useState(0);
  if (versions > seen) {
    setSeen(versions);
    setEvent(event + 1);
  }
  return (
    <StatusMessage
      message={event ? t("submitted") : null}
      eventId={event}
      confirmation
      className={shellStyles.confirmation}
    />
  );
};

const usePositions = () => {
  const { t } = useTranslation("reviewer");
  return [
    { id: "Fund", label: t("fund") },
    { id: "Fund with a condition", label: t("conditional") },
    { id: "Defer", label: t("defer") },
    { id: "Decline", label: t("declineFunding") },
  ] as const;
};

const problemMessage = {
  position: "positionRequired",
  amount: "amountRequired",
  reasoning: "reasoningRequired",
  note: "noteRequired",
  content: "contentInvalid",
} as const satisfies Record<ReviewerSubmissionProblem, string>;

const ReviewerDraftForm = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const { page, draft } = work;
  if (!draft) {
    return null;
  }

  const error = (problem: ReviewerSubmissionProblem) =>
    work.problems.includes(problem) ? t(problemMessage[problem]) : undefined;

  const update = (change: Partial<Draft>) => work.update({ ...draft, ...change });

  return (
    <>
      <ReviewerDraftConflict work={work} />
      <FundingJudgment work={work} draft={draft} />
      <TextField
        label={t("reasoning")}
        description={draft.position === "Fund with a condition" ? t("conditionsHint") : undefined}
        isRequired
        isReadOnly={work.submissionPending}
        isInvalid={Boolean(error("reasoning"))}
        errorMessage={error("reasoning")}
        multiline
        rows={10}
        maxLength={20000}
        value={draft.reasoning}
        onChange={(reasoning) => update({ reasoning })}
      />
      <CriterionNotes work={work} draft={draft} criteria={page.criteria ?? []} />
      {page.assessment && (
        <TextField
          label={t("changeNote")}
          isReadOnly={work.submissionPending}
          isRequired
          isInvalid={Boolean(error("note"))}
          errorMessage={error("note")}
          multiline
          rows={3}
          maxLength={2000}
          value={draft.note}
          onChange={(note) => update({ note })}
        />
      )}
    </>
  );
};

/** Position and amount belong together: funding positions need an amount above zero. */
const FundingJudgment = ({ work, draft }: { work: ReviewerWork; draft: Draft }) => {
  const { t } = useTranslation("reviewer");
  const positions = usePositions();
  const positionError = work.problems.includes("position") ? t("positionRequired") : undefined;
  const amountError = work.problems.includes("amount") ? t("amountRequired") : undefined;
  return (
    <div className={styles.judgment}>
      <Select
        label={t("position")}
        isRequired
        isDisabled={work.submissionPending}
        isInvalid={Boolean(positionError)}
        errorMessage={positionError}
        selectedKey={draft.position}
        items={positions}
        onSelectionChange={(position) => {
          work.update({
            ...draft,
            position,
            amount: fundingPositions.has(position) ? draft.amount : null,
          });
        }}
      />
      {draft.position && fundingPositions.has(draft.position) && (
        <MoneyField
          label={t("amount")}
          isRequired
          isReadOnly={work.submissionPending}
          isInvalid={Boolean(amountError)}
          errorMessage={amountError}
          precisionMessage={t("amountFormat")}
          prefix={{ text: "€", label: t("euros") }}
          value={draft.amount ?? ""}
          onChange={(amount) => work.update({ ...draft, amount: amount || null })}
        />
      )}
    </div>
  );
};

/** Optional notes, each beside the criterion it addresses. */
const CriterionNotes = ({
  work,
  draft,
  criteria,
}: {
  work: ReviewerWork;
  draft: Draft;
  criteria: Criteria;
}) => {
  const { t } = useTranslation("reviewer");
  const headingId = useId();
  const observations = reconcileObservations(draft.observations, criteria);
  if (!observations.length) {
    return null;
  }

  const description = (note: (typeof observations)[number]) =>
    criteria.find((criterion) => criterion.title === note.criterion)?.description;

  return (
    <Stack as="section" gap={4} aria-labelledby={headingId} className={styles.notes}>
      <h3 id={headingId}>{t("observations")}</h3>
      {observations.map((observation, index) => (
        <TextField
          key={observation.criterionId ?? `${observation.criterion}-${index}`}
          label={observation.criterion}
          description={description(observation)}
          isReadOnly={work.submissionPending}
          multiline
          rows={3}
          maxLength={5000}
          value={observation.text}
          onChange={(text) =>
            work.update({
              ...draft,
              observations: observations.map((note, position) =>
                position === index ? { ...note, text } : note,
              ),
            })
          }
        />
      ))}
    </Stack>
  );
};

/** A judgment as the manager will read it: outcome, reasoning, then criterion notes. */
const JudgmentSummary = ({
  content,
  note,
}: {
  content: NonNullable<ReviewerPage["assessment"]>["versions"][number]["content"];
  note?: string;
}) => {
  const { t } = useTranslation("reviewer");
  const amount = content.amount === null ? null : decodeMoney(content.amount);
  return (
    <Stack gap={3}>
      <AssessmentOutcome position={content.position} amount={amount} />
      <p className={styles.writing}>{content.reasoning}</p>
      {content.observations
        .filter((observation) => observation.text.trim())
        .map((observation, index) => (
          <div key={index}>
            <p className={styles.noteTitle}>{observation.criterion}</p>
            <p className={styles.writing}>{observation.text}</p>
          </div>
        ))}
      {note && (
        <div>
          <p className={styles.noteTitle}>{t("amendmentNote")}</p>
          <p className={styles.writing}>{note}</p>
        </div>
      )}
    </Stack>
  );
};

/** Recovery shows the exact writing, including values that cannot be submitted yet. */
const useDraftFields = (draft: Draft | undefined) => {
  const { t } = useTranslation("reviewer");
  const positions = usePositions();
  return draft
    ? [
        {
          label: t("position"),
          value: positions.find((position) => position.id === draft.position)?.label ?? "",
        },
        { label: t("amount"), value: draft.amount ?? "" },
        { label: t("reasoning"), value: draft.reasoning },
        ...draft.observations.map((observation) => ({
          label: observation.criterion,
          value: observation.text,
        })),
        ...(draft.note ? [{ label: t("amendmentNote"), value: draft.note }] : []),
      ]
    : [];
};

const DraftFields = ({ fields }: { fields: ReturnType<typeof useDraftFields> }) => (
  <Stack gap={3}>
    {fields.map((field, index) => (
      <div key={index}>
        <p className={styles.noteTitle}>{field.label}</p>
        <p className={styles.writing}>{field.value}</p>
      </div>
    ))}
  </Stack>
);

const DraftSummary = ({ draft }: { draft: Draft }) => (
  <DraftFields fields={useDraftFields(draft)} />
);

const useRecordedAt = () => {
  const { formatLocale } = useLocaleSettings();
  return (value: string) =>
    new Date(value).toLocaleString(formatLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
};

const SubmittedAssessment = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const recordedAt = useRecordedAt();
  const latest = work.page.assessment?.versions.at(-1);
  if (!latest) {
    return null;
  }
  const name = latest.recorder?.name ?? work.page.assignment.reviewer;
  return (
    <>
      <ReviewerFeedback work={work} />
      <JudgmentSummary content={latest.content} />
      <p className={styles.hint}>
        {latest.recorder
          ? t("submittedOn", { name, date: recordedAt(latest.recorder.recordedAt) })
          : t("submittedBy", { name })}
      </p>
    </>
  );
};

const EarlierVersions = ({ page }: { page: ReviewerPage }) => {
  const { t } = useTranslation("reviewer");
  const recordedAt = useRecordedAt();
  const earlier = page.assessment?.versions.slice(0, -1) ?? [];
  if (!earlier.length) {
    return null;
  }
  return (
    <details className={styles.history}>
      <summary>{t("history")}</summary>
      <Stack gap={5}>
        {earlier.map((version, index) => (
          <section key={index} aria-label={t("version", { version: index + 1 })}>
            <h3 className={styles.noteTitle}>
              {t("version", { version: index + 1 })}
              {version.recorder && ` · ${recordedAt(version.recorder.recordedAt)}`}
            </h3>
            <JudgmentSummary content={version.content} note={version.note} />
          </section>
        ))}
      </Stack>
    </details>
  );
};

/** Both versions stay recoverable without replacing the reviewer's form. */
const ReviewerDraftConflict = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const saved = work.conflict?.draft?.content;
  if (!saved || !work.draft) {
    return null;
  }
  return (
    <ConflictBanner
      title={t("conflictTitle")}
      message={t("saveConflict")}
      keepMine={{ label: t("keepMine"), onPress: () => work.reconcile(false) }}
      useSaved={{ label: t("useSaved"), onPress: () => work.reconcile(true) }}
      isDisabled={work.busy}
      latest={{
        toggleLabel: t("viewSaved"),
        hideLabel: t("hideSaved"),
        heading: t("serverDraft"),
        children: <DraftSummary draft={saved} />,
      }}
    />
  );
};

/** Retained after access ends so the reviewer can copy writing that never reached the server. */
export const RetainedDraft = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const fields = useDraftFields(work.draft);
  const [copying, setCopying] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(0);
  if (work.canWrite || !work.dirty || !work.draft) {
    return null;
  }

  const copy = async () => {
    setCopying(true);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(
        [
          work.page.assignment.applicationTitle,
          ...fields.map((field) => `${field.label}\n${field.value}`),
        ].join("\n\n"),
      );
      setCopied((event) => event + 1);
    } catch {
      setCopyFailed(true);
    }
    setCopying(false);
  };

  return (
    <Stack
      as="section"
      gap={3}
      className={styles.retainedDraft}
      aria-label={t("unsavedAssessment")}
    >
      <SectionHeader
        title={t("unsavedAssessment")}
        aside={
          <Button variant="secondary" size="small" isDisabled={copying} onPress={() => void copy()}>
            {t(copying ? "copyingDraft" : "copyDraft")}
          </Button>
        }
      />
      <p>{t("retainedDraft")}</p>
      {copyFailed && (
        <Notice appearance="inline" tone="danger" role="alert">
          {t("copyFailed")}
        </Notice>
      )}
      <StatusMessage
        message={copied && !copying && !copyFailed ? t("draftCopied") : null}
        eventId={copied}
        confirmation
        className={shellStyles.confirmation}
      />
      <DraftFields fields={fields} />
    </Stack>
  );
};

const DraftSaveStatus = ({ busy, dirty }: { busy: boolean; dirty: boolean }) => {
  const { t } = useTranslation("reviewer");
  return (
    <p role="status" className={styles.hint}>
      {t(busy ? "saving" : dirty ? "unsaved" : "saved")}
    </p>
  );
};

const ReviewerSubmitActions = ({
  work,
  onInvalid,
}: {
  work: ReviewerWork;
  onInvalid: () => void;
}) => {
  const { t } = useTranslation("reviewer");
  const amending = Boolean(work.page.assessment);
  return (
    <>
      <div className={styles.footerFeedback}>
        {work.problems.includes("content") && (
          <Notice appearance="inline" role="alert" tone="danger">
            {t("contentInvalid")}
          </Notice>
        )}
        <ReviewerFeedback work={work} />
        <p className={styles.hint}>{t(amending ? "amendmentHelp" : "privacy")}</p>
      </div>
      {amending ? (
        <Button
          variant="quiet"
          isDisabled={work.busy || work.submissionPending}
          onPress={work.discardAmendment}
        >
          {t("discardAmendment")}
        </Button>
      ) : (
        <DraftSaveStatus busy={work.busy} dirty={work.dirty} />
      )}
      <Inline align="center">
        {amending && <DraftSaveStatus busy={work.busy} dirty={work.dirty} />}
        {work.error &&
          work.error !== "draftInvalid" &&
          !work.conflict &&
          !work.submissionPending && (
            <Button variant="secondary" isDisabled={work.busy} onPress={() => void work.save()}>
              {t("retry")}
            </Button>
          )}
        {amending && (
          <Button
            variant="secondary"
            isDisabled={work.submissionPending}
            onPress={work.closeAmendment}
          >
            {t("close")}
          </Button>
        )}
        <Button
          isDisabled={work.busy || Boolean(work.conflict)}
          onPress={async () => {
            if ((await work.submit()) === "invalid") {
              onInvalid();
            }
          }}
        >
          {t(amending ? "amend" : "submit")}
        </Button>
      </Inline>
    </>
  );
};
