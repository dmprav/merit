import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { parseMoney } from "@merit/money";
import { moneyInput, normalizeMoneyInput } from "@merit/money/input";
import { RecommendationOutcome } from "@merit/recommendations-web/work";
import type { ReviewerPage } from "@merit/reviews/api";
import type { ReviewerSubmissionProblem } from "@merit/reviews/domain";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { WorkPane } from "@merit/ui/reference-workspace";
import { Select } from "@merit/ui/select";
import { StatusMessage } from "@merit/ui/status-message";
import { TextField } from "@merit/ui/text-field";

import { reconcileObservations } from "../../controllers/reviews/observations";
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
          {writing ? <ReviewerDraftForm work={work} /> : <SubmittedAssessment work={work} />}
          <EarlierVersions page={page} />
        </Stack>
      </div>
    </WorkPane>
  );
};

const AmendmentTrigger = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  return (
    <Button
      variant="quiet"
      size="small"
      data-draft={work.amendmentDraft || undefined}
      onPress={work.startAmendment}
    >
      <Icon name="edit" />
      {t(work.amendmentDraft ? "resumeAmendment" : "startAmendment")}
    </Button>
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
      <div className={styles.intro}>
        {!page.assessment && <p>{t("instructions")}</p>}
        <p>{t(page.assessment ? "amendmentHelp" : "privacy")}</p>
      </div>
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
  const [amountFormat, setAmountFormat] = useState(false);
  const positionError = work.problems.includes("position") ? t("positionRequired") : undefined;
  const amountError = amountFormat
    ? t("amountFormat")
    : work.problems.includes("amount")
      ? t("amountRequired")
      : undefined;
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
          setAmountFormat(false);
          work.update({
            ...draft,
            position,
            amount: fundingPositions.has(position) ? draft.amount : null,
          });
        }}
      />
      {draft.position && fundingPositions.has(draft.position) && (
        <TextField
          label={t("amount")}
          isRequired
          isReadOnly={work.submissionPending}
          isInvalid={Boolean(amountError)}
          errorMessage={amountError}
          prefix={{ text: "€", label: t("euros") }}
          inputMode="decimal"
          value={draft.amount ?? ""}
          onChange={(value) => {
            // Reject excess precision with feedback while retaining the previous input.
            const accepted = moneyInput(value);
            setAmountFormat(accepted === null);
            if (accepted !== null) {
              work.update({ ...draft, amount: accepted || null });
            }
          }}
          onBlur={() =>
            draft.amount && work.update({ ...draft, amount: normalizeMoneyInput(draft.amount) })
          }
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
      <div>
        <h3 id={headingId}>{t("observations")}</h3>
        <p className={styles.hint}>{t("notesHelp")}</p>
      </div>
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
const JudgmentSummary = ({ content, note }: { content: Draft; note?: string }) => {
  const { t } = useTranslation("reviewer");
  const amount = content.amount === null ? null : parseMoney(content.amount);
  return (
    <Stack gap={3}>
      <RecommendationOutcome
        recommendation={{
          position: content.position,
          allocation: amount?.ok ? amount.value : null,
        }}
      />
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
      <JudgmentSummary content={{ ...latest.content, note: "" }} />
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
            <JudgmentSummary content={{ ...version.content, note: "" }} note={version.note} />
          </section>
        ))}
      </Stack>
    </details>
  );
};

/** Both versions stay visible so the reviewer can choose with the difference in view. */
const ReviewerDraftConflict = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const saved = work.conflict?.draft?.content;
  if (!saved || !work.draft) {
    return null;
  }
  return (
    <Notice as="div" tone="warning">
      <Stack gap={4}>
        <p>{t("saveConflict")}</p>
        <div className={styles.comparison}>
          <section aria-label={t("serverDraft")}>
            <h3 className={styles.noteTitle}>{t("serverDraft")}</h3>
            <JudgmentSummary content={saved} note={saved.note} />
          </section>
          <section aria-label={t("yourText")}>
            <h3 className={styles.noteTitle}>{t("yourText")}</h3>
            <JudgmentSummary content={work.draft} note={work.draft.note} />
          </section>
        </div>
        <Inline>
          <Button variant="secondary" onPress={() => work.reconcile(true)}>
            {t("useSaved")}
          </Button>
          <Button variant="secondary" onPress={() => work.reconcile(false)}>
            {t("keepMine")}
          </Button>
        </Inline>
      </Stack>
    </Notice>
  );
};

/** Retained after access ends so the reviewer can copy writing that never reached the server. */
export const RetainedDraft = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  if (work.canWrite || !work.dirty || !work.draft) {
    return null;
  }
  return (
    <Stack gap={3}>
      <Notice>{t("retainedDraft")}</Notice>
      <JudgmentSummary content={work.draft} note={work.draft.note} />
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
        {work.problems.length > 0 && (
          <Notice role="alert" tone="danger">
            {t("fixFields")}
          </Notice>
        )}
        <ReviewerFeedback work={work} />
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
        {work.error && !work.conflict && !work.submissionPending && (
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
