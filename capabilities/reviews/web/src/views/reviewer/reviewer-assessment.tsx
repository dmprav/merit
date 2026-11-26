import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConflictBanner } from "@merit/forms";
import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { ReviewerPage } from "@merit/reviews/api";
import type { ReviewerSubmissionProblem } from "@merit/reviews/domain";
import { Attribution } from "@merit/ui/attribution";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { PickerPopover } from "@merit/ui/dialog";
import { Disclosure } from "@merit/ui/disclosure";
import { Divider } from "@merit/ui/divider";
import { Icon } from "@merit/ui/icon";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Link } from "@merit/ui/link";
import { MoneyField } from "@merit/ui/money-field";
import { Notice } from "@merit/ui/notice";
import { WorkPane } from "@merit/ui/reference-workspace";
import { SectionHeader } from "@merit/ui/section-header";
import { Select } from "@merit/ui/select";
import { Text } from "@merit/ui/text";
import { TextField } from "@merit/ui/text-field";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";
import { showToast, useEventToast } from "@merit/ui/toast";
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
  const writing = work.canWrite && Boolean(work.draft) && (!page.assessment || work.amending);
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
      titleMeta={
        <AssessmentRequest
          assignment={page.assignment}
          note={writing ? t(page.assessment ? "amendmentHelp" : "privacy") : undefined}
        />
      }
      titleActions={
        work.canWrite && !writing && page.assessment && <AmendmentTrigger work={work} />
      }
      footer={
        writing && (
          <ReviewerSubmitActions work={work} onInvalid={() => setAttempt((value) => value + 1)} />
        )
      }
    >
      <SubmissionConfirmation page={page} />
      <div ref={form}>
        <Stack gap={5}>
          <WithdrawnNotice page={page} />
          {writing ? <ReviewerDraftForm work={work} /> : <SubmittedAssessment work={work} />}
          <EarlierVersions page={page} />
          <RetainedDraft work={work} />
        </Stack>
      </div>
    </WorkPane>
  );
};

/** Access that ends removes the material, so only withdrawal explains itself in this pane. */
const WithdrawnNotice = ({ page }: { page: ReviewerPage }) => {
  const { t } = useTranslation("reviewer");
  if (page.work.available || page.work.reason !== "application_withdrawn") {
    return null;
  }
  const { managerEmail, managerName } = page.assignment;
  return (
    <Notice
      tone="neutral"
      actions={
        <Link href={`mailto:${managerEmail}`}>{t("contactManager", { name: managerName })}</Link>
      }
    >
      {t("withdrawnReadOnly")}
    </Notice>
  );
};

/**
 * When the response is due beside the pane title, and on request who asked, by when, and while
 * writing, who can read the draft.
 */
const AssessmentRequest = ({
  assignment,
  note,
}: {
  assignment: ReviewerPage["assignment"];
  note?: string;
}) => {
  const { t } = useTranslation("reviewer");
  const format = useFormat();
  const due = assignment.dueDate && format.calendarDate(assignment.dueDate);
  const [open, setOpen] = useState(false);
  return (
    <>
      {due && <Badge>{t("dueBadge", { date: due })}</Badge>}
      <PickerPopover
        title={t("requestDetails")}
        placement="bottom start"
        isOpen={open}
        onOpenChange={setOpen}
        trigger={
          <Tooltip content={t("requestDetails")} isDisabled={open}>
            <Button variant="quiet" iconOnly aria-label={t("requestDetails")}>
              <Icon name="info" />
            </Button>
          </Tooltip>
        }
      >
        <Text as="div" variant="supporting">
          <Stack gap={2}>
            <p>{t("requestedBy", { name: assignment.managerName })}</p>
            <p>{due ? t("dueOn", { date: due }) : t("noDue")}</p>
            {note && <p>{note}</p>}
          </Stack>
        </Text>
      </PickerPopover>
    </>
  );
};

const AmendmentTrigger = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const label = t(work.amendmentDraft ? "resumeAmendment" : "startAmendment");
  return (
    <Tooltip content={label}>
      <Button
        variant="quiet"
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
  useEventToast(event, { tone: "success", message: t(versions > 1 ? "amended" : "submitted") });
  return null;
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
    <section className={styles.notes} aria-labelledby={headingId}>
      <Stack gap={4}>
        <SectionHeader level={3} id={headingId} title={t("observations")} />
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
    </section>
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
  const observations = content.observations.filter((observation) => observation.text.trim());
  return (
    <Stack gap={3}>
      <AssessmentOutcome position={content.position} amount={amount} />
      <Reading as="p">{content.reasoning}</Reading>
      {(observations.length > 0 || note) && (
        <DescriptionList>
          {observations.map((observation, index) => (
            <DescriptionListItem key={index} label={observation.criterion}>
              <Reading as="p">{observation.text}</Reading>
            </DescriptionListItem>
          ))}
          {note && (
            <DescriptionListItem label={t("amendmentNote")}>
              <Reading as="p">{note}</Reading>
            </DescriptionListItem>
          )}
        </DescriptionList>
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
  <DescriptionList>
    {fields.map((field, index) => (
      <DescriptionListItem key={index} label={field.label}>
        <Reading as="p">{field.value}</Reading>
      </DescriptionListItem>
    ))}
  </DescriptionList>
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
      <Text as="p" variant="supporting">
        {latest.recorder
          ? t("submittedOn", { name, date: recordedAt(latest.recorder.recordedAt) })
          : t("submittedBy", { name })}
      </Text>
    </>
  );
};

const EarlierVersions = ({ page }: { page: ReviewerPage }) => {
  const { t } = useTranslation("reviewer");
  const earlier = page.assessment?.versions.slice(0, -1) ?? [];
  if (!earlier.length) {
    return null;
  }
  return (
    <Disclosure title={t("history")} count={earlier.length}>
      <Timeline label={t("history")}>
        {earlier.map((version, index) => (
          <TimelineEntry
            key={index}
            title={t("version", { version: index + 1 })}
            attribution={
              version.recorder && (
                <Attribution
                  actor={version.recorder.name}
                  recordedAt={version.recorder.recordedAt}
                />
              )
            }
          >
            <JudgmentSummary content={version.content} note={version.note} />
          </TimelineEntry>
        ))}
      </Timeline>
    </Disclosure>
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
  if (work.canWrite || !work.dirty || !work.draft) {
    return null;
  }

  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(
        [
          work.page.assignment.applicationTitle,
          ...fields.map((field) => `${field.label}\n${field.value}`),
        ].join("\n\n"),
      );
      showToast({ tone: "success", message: t("draftCopied") });
    } catch {
      showToast({ tone: "danger", message: t("copyFailed") });
    }
    setCopying(false);
  };

  return (
    <Stack as="section" gap={5} aria-label={t("unsavedAssessment")}>
      <Divider />
      <Stack gap={3}>
        <SectionHeader
          title={t("unsavedAssessment")}
          aside={
            <Button variant="secondary" isDisabled={copying} onPress={() => void copy()}>
              {t(copying ? "copyingDraft" : "copyDraft")}
            </Button>
          }
        />
        <p>{t("retainedDraft")}</p>
        <DraftFields fields={fields} />
      </Stack>
    </Stack>
  );
};

const DraftSaveStatus = ({
  busy,
  dirty,
  amending,
}: {
  busy: boolean;
  dirty: boolean;
  amending: boolean;
}) => {
  const { t } = useTranslation("reviewer");
  return (
    <div role="status">
      <Text as="p" variant="supporting">
        {/* An amendment is read with the earlier versions, so only a first draft is private. */}
        {t(busy ? "saving" : dirty ? "unsaved" : amending ? "saved" : "savedPrivate")}
      </Text>
    </div>
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
  const canRetry =
    work.error === "unavailable" && work.dirty && !work.conflict && !work.submissionPending;
  return (
    <>
      <div className={styles.footerFeedback}>
        {work.problems.includes("content") && (
          <Notice appearance="inline" role="alert" tone="danger">
            {t("contentInvalid")}
          </Notice>
        )}
        <ReviewerFeedback work={work} offerRefresh={!canRetry} />
        {/* Who reads an amendment stays beside the command that sends it. */}
        {amending && (
          <Text as="p" variant="supporting">
            {t("amendmentHelp")}
          </Text>
        )}
      </div>
      {/* One row: whether the draft is saved, then the commands that act on it. */}
      <DraftSaveStatus busy={work.busy} dirty={work.dirty} amending={amending} />
      <Inline align="center">
        {amending && (
          <Button
            variant="quiet"
            isDisabled={work.busy || work.submissionPending}
            onPress={work.discardAmendment}
          >
            {t("discardAmendment")}
          </Button>
        )}
        {canRetry && (
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
