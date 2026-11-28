import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { decodeMoney, toDecimal, type MoneyData } from "@merit/money";
import {
  saveReviewerDraftSchema,
  type ReviewerPage,
  type ReviewerService,
} from "@merit/reviews/api";
import { assessmentAmountEntrySchema, reviewerSubmissionProblems } from "@merit/reviews/domain";

import type { ReviewerData } from "../../contracts/reviewer";

type Draft = NonNullable<ReviewerPage["draft"]>["content"];

const same = (a: Draft | undefined, b: Draft | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const matchesSubmittedAmount = (text: string | null, amount: MoneyData | null) => {
  const parsed = assessmentAmountEntrySchema.safeParse(text);
  return parsed.success && parsed.data?.minorUnits === amount?.minorUnits;
};

/** Whether the working draft departs from the latest submitted assessment. */
const differsFromSubmitted = (page: ReviewerPage, content: Draft | undefined) => {
  const submitted = page.assessment?.versions.at(-1)?.content;
  return Boolean(
    submitted &&
    content &&
    (content.note ||
      content.reasoning !== submitted.reasoning ||
      content.position !== submitted.position ||
      !matchesSubmittedAmount(content.amount, submitted.amount) ||
      JSON.stringify(content.observations) !== JSON.stringify(submitted.observations)),
  );
};

/** The submitted content as a draft with no amendment note. */
const submittedDraft = (page: ReviewerPage): Draft | undefined => {
  const submitted = page.assessment?.versions.at(-1)?.content;
  return (
    submitted && {
      position: submitted.position,
      amount: submitted.amount && toDecimal(decodeMoney(submitted.amount)),
      reasoning: submitted.reasoning,
      observations: submitted.observations,
      note: "",
    }
  );
};

/** Local submission checks and whether the amendment editor is open. */
const useSubmissionWork = (
  page: ReviewerPage,
  draft: Draft | undefined,
  latestDraft: RefObject<Draft | undefined>,
  update: (value: Draft | undefined) => void,
  session?: ReviewerSession,
) => {
  // Returning to the page opens the reading view; unfinished amendments are resumed explicitly.
  const [amending, setAmending] = useState(session?.amending ?? false);
  const [attempted, setAttempted] = useState(session?.attempted ?? false);
  const amendment = Boolean(page.assessment);

  const leaveAmendment = () => {
    setAttempted(false);
    setAmending(false);
  };

  return {
    amending,
    setAmending,
    problems: attempted && draft ? reviewerSubmissionProblems(draft, amendment) : [],
    amendmentDraft: differsFromSubmitted(page, draft),
    /** Whether the latest draft can be sent; otherwise its problems appear beside fields. */
    check: () => {
      const current = latestDraft.current;
      const ready = !current || !reviewerSubmissionProblems(current, amendment).length;
      setAttempted(!ready);
      return ready;
    },
    startAmendment: () => setAmending(true),
    closeAmendment: leaveAmendment,
    /** Returns the working draft to the submitted assessment; autosave records it. */
    discardAmendment: () => {
      leaveAmendment();
      update(submittedDraft(page));
    },
  };
};

export type ReviewerErrorKey =
  | "unavailable"
  | "accessLost"
  | "saveConflict"
  | "stale"
  | "expired"
  | "applicationWithdrawn"
  | "draftInvalid"
  | "submissionInvalid"
  | "submissionSaved";

/**
 * Client session a preview resumes. The loaded assignment does not include an in-progress
 * save, a failed request, or an open amendment.
 */
export type ReviewerSession = {
  busy?: boolean;
  error?: ReviewerErrorKey | null;
  attempted?: boolean;
  amending?: boolean;
  /** Unsaved local draft. The assignment draft remains the last saved copy. */
  draft?: Draft;
  /** The other device's assignment, shown beside the local draft. */
  conflict?: ReviewerPage | null;
};

const initialReviewerState = (page: ReviewerPage, session: ReviewerSession = {}) => ({
  busy: session.busy ?? false,
  error: session.error ?? null,
  draft: session.draft ?? page.draft?.content,
  saved: page.draft?.content,
  revision: page.draft?.revision ?? 0,
  conflict: session.conflict ?? null,
});

// oxlint-disable-next-line max-lines-per-function -- These actions share one draft, retry receipts, and submission lifecycle.
export const useReviewer = (
  initial: ReviewerPage,
  data: ReviewerData,
  onDirtyChange?: (dirty: boolean) => void,
  session?: ReviewerSession,
) => {
  const start = initialReviewerState(initial, session);
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState(start.busy);
  const working = useRef(false);
  const [error, setError] = useState<ReviewerErrorKey | null>(start.error);
  const pendingSubmission = useRef<Parameters<ReviewerService["submit"]>[1] | null>(null);
  const submissionConfirmed = useRef(false);
  const pendingResponse = useRef<Parameters<ReviewerService["respond"]>[1] | null>(null);
  const [submissionPending, setSubmissionPending] = useState(false);
  // Reviews decides whether writes can succeed; each save and submission is checked again.
  const canWrite = page.work.available;

  const [draft, setDraft] = useState(start.draft);
  const latestDraft = useRef(start.draft);

  const update = (value: Draft | undefined) => {
    setError((current) => (current === "draftInvalid" ? null : current));
    latestDraft.current = value;
    setDraft(value);
  };

  const [saved, setSaved] = useState(start.saved);
  const [revision, setRevision] = useState(start.revision);
  const [conflict, setConflict] = useState<ReviewerPage | null>(start.conflict);
  const pendingSave = useRef<SaveCommand | null>(null);
  const dirty = !same(draft, saved);
  const loadConflict = useCallback(async () => {
    const current = await data.read();
    if (current.status === "ok") {
      setConflict(current.value);
      setPage(current.value);
    }
    setError("saveConflict");
  }, [data, setPage, setError, setConflict]);

  const save = useCallback(async () => {
    if (!draft || !canWrite || working.current || conflict) {
      return null;
    }
    if (!dirty && !pendingSave.current) {
      return { revision, content: draft };
    }
    working.current = true;
    setBusy(true);
    setError(null);
    const input = pendingSave.current ?? {
      assignmentId: page.assignment.id,
      commandId: crypto.randomUUID(),
      expectedDraftRevision: revision,
      draft,
    };
    let savedResult: { revision: number; content: Draft } | null = null;
    try {
      const result = await persistDraft(data, input, pendingSave);
      if (result.status === "ok") {
        setRevision(result.value.revision);
        setSaved(input.draft);
        savedResult = { revision: result.value.revision, content: input.draft };
      } else if (result.status === "conflict") {
        await loadConflict();
      } else {
        setError(saveError(result, input.draft, latestDraft.current));
      }
    } catch {
      setError("unavailable");
    }
    working.current = false;
    setBusy(false);
    return savedResult;
  }, [
    draft,
    canWrite,
    conflict,
    dirty,
    revision,
    page.assignment.id,
    data,
    loadConflict,
    setRevision,
    setSaved,
    working,
    setBusy,
    setError,
  ]);

  const { setAmending, check, ...submission } = useSubmissionWork(
    page,
    draft,
    latestDraft,
    update,
    session,
  );

  useDraftSafety(dirty, submissionPending, onDirtyChange);

  useAutosave(canAutosave({ dirty, busy, error, canWrite, conflict, submissionPending }), save);

  const applyResponse = async (
    action: Parameters<ReviewerService["respond"]>[1]["action"],
    note: string,
  ) => {
    const input = pendingResponse.current ?? {
      assignmentId: page.assignment.id,
      commandId: crypto.randomUUID(),
      expectedRevision: page.assignment.revision,
      action,
      note,
    };
    pendingResponse.current = input;
    const result = await data.respond(input);
    if (result.status !== "ok") {
      if (result.status !== "unavailable") {
        pendingResponse.current = null;
      }
      setError(responseError(result));
      return false;
    }
    const current = await data.read();
    if (current.status !== "ok") {
      setError("unavailable");
      return false;
    }
    pendingResponse.current = null;
    setPage(current.value);
    update(current.value.draft?.content);
    setSaved(current.value.draft?.content);
    setRevision(current.value.draft?.revision ?? 0);
    return true;
  };

  const respond = async (
    action: Parameters<ReviewerService["respond"]>[1]["action"],
    note: string,
  ) => {
    if (working.current) {
      return false;
    }
    if (!canRetryResponse(pendingResponse.current, action, note)) {
      setError("stale");
      return false;
    }
    if (dirty && canWrite) {
      const savedDraft = await save();
      if (!savedDraft || !same(savedDraft.content, latestDraft.current)) {
        return false;
      }
    }
    working.current = true;
    setBusy(true);
    setError(null);
    let succeeded = false;
    try {
      succeeded = await applyResponse(action, note);
    } catch {
      setError("unavailable");
    }
    working.current = false;
    setBusy(false);
    return succeeded;
  };

  const submissionFailure = async (failure: Failure) => {
    const { status } = failure;
    if (status !== "unavailable") {
      pendingSubmission.current = null;
      setSubmissionPending(false);
    }
    setError(submitError(failure));
    if (status === "conflict") {
      const current = await data.read();
      if (current.status === "ok") {
        setConflict(current.value);
      }
    }
  };

  const reloadSubmission = async () => {
    const current = await data.read();
    if (current.status === "ok") {
      pendingSubmission.current = null;
      submissionConfirmed.current = false;
      setSubmissionPending(false);
      setAmending(false);
      setPage(current.value);
      update(current.value.draft?.content);
      setSaved(current.value.draft?.content);
      setRevision(current.value.draft?.revision ?? 0);
    } else {
      setError("submissionSaved");
    }
  };

  const submitReview = async () => {
    if (working.current || conflict) {
      return;
    }
    let input = pendingSubmission.current;
    if (!input) {
      const savedDraft = await save();
      if (!savedDraft || !same(savedDraft.content, latestDraft.current)) {
        return;
      }
      input = {
        assignmentId: page.assignment.id,
        commandId: crypto.randomUUID(),
        expectedDraftRevision: savedDraft.revision,
      };
    }
    working.current = true;
    setBusy(true);
    setError(null);
    pendingSubmission.current = input;
    setSubmissionPending(true);
    try {
      const result = submissionConfirmed.current
        ? { status: "ok" as const }
        : await data.submit(input);
      if (result.status !== "ok") {
        await submissionFailure(result);
      } else {
        submissionConfirmed.current = true;
        await reloadSubmission();
      }
    } catch {
      setError(submissionConfirmed.current ? "submissionSaved" : "unavailable");
    }
    working.current = false;
    setBusy(false);
  };

  const reconcile = (useSaved: boolean) => {
    if (!conflict?.draft) {
      return;
    }
    if (useSaved) {
      update(conflict.draft.content);
    }
    setSaved(conflict.draft.content);
    setRevision(conflict.draft.revision);
    pendingSave.current = null;
    setConflict(null);
    setError(null);
  };

  const refresh = async () => {
    try {
      const result = await data.read();
      if (result.status !== "ok") {
        setError("accessLost");
        return;
      }
      pendingResponse.current = null;
      setPage(result.value);
      if (!dirty || submissionConfirmed.current) {
        update(result.value.draft?.content);
        setSaved(result.value.draft?.content);
        setRevision(result.value.draft?.revision ?? 0);
      }
      if (submissionConfirmed.current) {
        pendingSubmission.current = null;
        submissionConfirmed.current = false;
        setSubmissionPending(false);
        setAmending(false);
      }
      setError(null);
    } catch {
      setError("unavailable");
    }
  };

  /** Checks the draft locally first so each problem appears beside its field. */
  const submit = async () => {
    if (!check()) {
      return "invalid" as const;
    }
    await submitReview();
    return "sent" as const;
  };

  return {
    page,
    draft,
    dirty,
    busy,
    error,
    conflict,
    canWrite,
    submissionPending,
    update,
    save,
    refresh,
    respond,
    submit,
    reconcile,
    ...submission,
  };
};

type Failure = { status: string; error?: string };

const responseError = ({ status, error }: Failure) => {
  if (error === "application_withdrawn") {
    return "applicationWithdrawn";
  }
  if (status === "conflict" || error === "action_unavailable") {
    return "stale";
  }
  return status === "expired" ? "expired" : "unavailable";
};

const submitError = ({ status, error }: Failure) => {
  if (error === "application_withdrawn") {
    return "applicationWithdrawn";
  }
  if (status === "invalid") {
    return "submissionInvalid";
  }
  if (status === "conflict") {
    return "saveConflict";
  }
  return status === "not_found" || status === "signed_out" ? "accessLost" : "unavailable";
};

const useDraftSafety = (
  dirty: boolean,
  submissionPending: boolean,
  onDirtyChange?: (dirty: boolean) => void,
) => {
  useEffect(() => {
    onDirtyChange?.(dirty || submissionPending);
  }, [dirty, submissionPending, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !submissionPending) {
      return;
    }

    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, submissionPending]);
};

const useAutosave = (enabled: boolean, save: () => Promise<unknown>) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = setTimeout(() => {
      void save();
    }, 700);
    return () => clearTimeout(timer);
  }, [enabled, save]);
};

const canAutosave = (state: {
  dirty: boolean;
  busy: boolean;
  error: string | null;
  canWrite: boolean;
  conflict: ReviewerPage | null;
  submissionPending: boolean;
}) =>
  state.dirty &&
  !state.busy &&
  !state.error &&
  state.canWrite &&
  !state.conflict &&
  !state.submissionPending;

type SaveCommand = Parameters<ReviewerService["saveDraft"]>[1];

const persistDraft = async (
  data: ReviewerData,
  input: SaveCommand,
  pending: RefObject<SaveCommand | null>,
) => {
  if (!saveReviewerDraftSchema.safeParse(input).success) {
    return { status: "invalid", error: "invalid_input" } as const;
  }
  pending.current = input;
  const result = await data.save(input);
  if (result.status !== "unavailable") {
    pending.current = null;
  }
  return result;
};

const saveError = (result: Failure, attempted: Draft, latest: Draft | undefined) => {
  if (result.error === "invalid_input") {
    return same(attempted, latest) ? "draftInvalid" : null;
  }
  if (result.error === "application_withdrawn") {
    return "applicationWithdrawn";
  }
  return result.status === "not_found" || result.status === "signed_out"
    ? "accessLost"
    : "unavailable";
};

const canRetryResponse = (
  pending: Parameters<ReviewerService["respond"]>[1] | null,
  action: string,
  note: string,
) => !pending || (pending.action === action && pending.note === note);
