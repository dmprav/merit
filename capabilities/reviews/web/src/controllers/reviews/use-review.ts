import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWorkflowRefresh } from "@merit/query/refresh";
import type { AssessmentInput, ReviewChange } from "@merit/reviews/domain";

import type {
  ReviewProps,
  ReviewData,
  ReviewProblem,
  ReviewRequest,
  ReviewBaseline,
} from "../../contracts/reviews";
import { useReviewDrafts, type ReviewDraft, type ReviewFormValues } from "./drafts";
import { reviewCommand } from "./review-command";
import { valuesFromContent } from "./values";

const applicationVersionsForReview = (
  application: ReviewProps["application"],
  availableVersions: readonly ReviewBaseline["applicationVersion"][],
) => {
  const versions = new Set([application.version, ...availableVersions]);
  for (const assessment of application.reviews.assessments) {
    for (const version of assessment.versions) {
      if (version.content.applicationVersion) {
        versions.add(version.content.applicationVersion);
      }
    }
  }

  return versions;
};

const hasTargetReviewConflict = (
  draft: ReviewDraft,
  state: ReviewProps["application"]["reviews"],
): boolean => {
  if (draft.mode === "edit") {
    const target = state.assessments.find((item) => item.id === draft.id);
    if (!target) {
      return true;
    }
    if (draft.assessmentVersion !== undefined) {
      return target.versions.length !== draft.assessmentVersion;
    }
    return draft.revision !== state.revision;
  }

  if (draft.revision >= state.revision) {
    return false;
  }
  if (draft.requestId) {
    const request = state.requests.find((item) => item.id === draft.requestId);
    if (request && request.status !== "outstanding") {
      return true;
    }
  } else if (
    state.requests.some(
      (item) => item.contactId === draft.values.contactId && item.status === "outstanding",
    )
  ) {
    return true;
  }
  if (draft.previousId === undefined) {
    return true;
  }
  const latest = state.assessments
    .filter((item) => item.contactId === draft.values.contactId)
    .at(-1);
  return (latest?.id ?? null) !== draft.previousId;
};

export const useReview = ({
  application,
  round,
  availableApplicationVersions = [],
  data,
}: ReviewProps & { data: ReviewData }) => {
  const { save, refresh, refreshError, refreshing, saved, saving } = useReviewSave(
    application,
    round,
    data,
  );

  const [replacementId, setReplacementId] = useState<string | null>(null);
  const state = application.reviews;
  const criteriaVersion = round.criteriaVersion;
  const pending = state.requests.filter((request) => request.status === "outstanding");
  const versions = applicationVersionsForReview(application, availableApplicationVersions);

  const currentBaseline = {
    revision: state.revision,
    applicationVersion: application.version,
    criteriaVersion,
  };

  const { draft, setError, ...editor } = useReviewEditing(
    application,
    currentBaseline,
    pending,
    data.draftKey,
  );
  const conflict = Boolean(draft && hasTargetReviewConflict(draft, state));
  const missingTarget = Boolean(
    draft?.mode === "edit" && !state.assessments.some((item) => item.id === draft.id),
  );

  const saveDraft = async (values: ReviewFormValues): Promise<ReviewProblem | null> => {
    if (!draft || conflict) {
      return { status: "conflict" };
    }

    const { change } = reviewCommand(draft, values, state);
    const failure = await save(change, currentBaseline);
    if (!failure) {
      editor.discard();
    }

    return failure;
  };

  return {
    draft,
    ...editor,
    replacementId,
    replaceRequest: (id: string) => setReplacementId(id),
    closeReplacement: () => setReplacementId(null),
    refreshError,
    refreshing,
    refresh: () => refresh(refreshError ?? "read"),
    saved,
    state,
    pending,
    versions,
    conflict,
    missingTarget,
    saving,
    beginRequest: (replacesId: string | null = null): ReviewRequest => {
      return (contactId, id) =>
        save({ action: "request", id, contactId, replacesId }, currentBaseline);
    },
    requestFollowUp: (contactId: string) =>
      save({ action: "request", id: crypto.randomUUID(), contactId, replacesId: null }).then(
        setError,
      ),
    cancelRequest: (id: string) => save({ action: "cancel", id }).then(setError),
    saveDraft,
  };
};

const useReviewSave = (
  application: ReviewProps["application"],
  round: ReviewProps["round"],
  data: ReviewData,
) => {
  const mutation = useMutation({
    mutationFn: ({
      change,
      baseline,
    }: {
      change: ReviewChange;
      baseline: Parameters<ReviewData["save"]>[1];
    }) => data.save(change, baseline),
  });

  const { refresh, refreshError, refreshing } = useWorkflowRefresh(() => data.refresh());
  const [saved, setSaved] = useState(0);

  const state = application.reviews;
  const criteriaVersion = round.criteriaVersion;

  const save = async (
    change: ReviewChange,
    baseline?: ReviewBaseline,
  ): Promise<ReviewProblem | null> => {
    const expected = baseline ?? {
      revision: state.revision,
      applicationVersion: application.version,
      criteriaVersion,
    };

    try {
      const response = await mutation.mutateAsync({
        change,
        baseline: expected,
      });
      if (response.status !== "ok") {
        if (response.status === "conflict") {
          await refresh("read");
          return { status: change.action === "request" ? "request_conflict" : "conflict" };
        }

        return response;
      }

      setSaved((value) => value + 1);
      await refresh("saved");
      return null;
    } catch {
      return { status: "unavailable" };
    }
  };

  return {
    save,
    refresh,
    refreshError,
    refreshing,
    saved,
    saving: mutation.isPending || refreshing,
  };
};

type ReviewOpening = {
  mode: ReviewDraft["mode"];
  contactId: string;
  id: string;
};

const newReviewDraft = (
  application: ReviewProps["application"],
  criteriaVersion: ReviewBaseline["criteriaVersion"],
  pending: ReviewProps["application"]["reviews"]["requests"],
  { mode, contactId, id }: ReviewOpening,
): ReviewDraft => {
  const assessment = application.reviews.assessments.find((item) => item.id === id);
  const request = pending.find((item) => item.contactId === contactId);
  const content: AssessmentInput = assessment?.versions.at(-1)!.content ?? {
    applicationVersion: request?.applicationVersion ?? null,
    criteriaVersion: request?.criteriaVersion ?? null,
    date: null,
    position: null,
    amount: null,
    reasoning: "",
    observations: (request?.criteria ?? []).map((item) => ({
      criterionId: item.id,
      criterion: item.title,
      text: "",
    })),
  };

  return {
    mode,
    id,
    revision: application.reviews.revision,
    applicationVersion: application.version,
    criteriaVersion,
    ...(mode === "edit" && assessment ? { assessmentVersion: assessment.versions.length } : {}),
    ...(mode === "record" && contactId
      ? {
          requestId: request?.id ?? null,
          previousId:
            application.reviews.assessments.filter((item) => item.contactId === contactId).at(-1)
              ?.id ?? null,
        }
      : {}),
    values: valuesFromContent(content, contactId),
  };
};

const useDeferredReviewOpening = (
  ready: boolean,
  editing: boolean,
  hasDraft: boolean,
  initialize: (request: ReviewOpening) => void,
) => {
  const [opening, setOpening] = useState<ReviewOpening | null>(null);
  useEffect(() => {
    if (ready && opening && editing) {
      if (!hasDraft) {
        initialize(opening);
      }
      setOpening(null);
    }
  }, [ready, opening, editing, hasDraft, initialize]);
  return [opening, setOpening] as const;
};

const useReviewEditing = (
  application: ReviewProps["application"],
  baseline: ReviewBaseline,
  pending: ReviewProps["application"]["reviews"]["requests"],
  key: string,
) => {
  const { reviewEdits, setReviewEdit, ready } = useReviewDrafts();
  const draft = reviewEdits[key];
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<ReviewProblem | null>(null);
  const [draftReset, setDraftReset] = useState(0);
  const initialValues = useRef<string | null>(null);

  const initialize = useCallback(
    (request: ReviewOpening) => {
      const next = newReviewDraft(application, baseline.criteriaVersion, pending, request);
      initialValues.current = JSON.stringify(next.values);
      setReviewEdit(key, next);
    },
    [application, baseline.criteriaVersion, pending, key, setReviewEdit],
  );
  const [opening, setOpening] = useDeferredReviewOpening(
    ready,
    editing,
    Boolean(draft),
    initialize,
  );

  const start = (mode: ReviewDraft["mode"], contactId = "", id: string = crypto.randomUUID()) => {
    setEditing(true);
    setError(null);
    const request = { mode, contactId, id };
    if (!ready) {
      setOpening(request);
    } else {
      initialize(request);
    }
  };

  const discard = () => {
    setReviewEdit(key, undefined);
    setEditing(false);
  };

  const close = () => {
    setOpening(null);
    if (draft && initialValues.current === JSON.stringify(draft.values)) {
      setReviewEdit(key, undefined);
    }
    setEditing(false);
  };

  const loadLatest = () => {
    if (!draft) {
      return;
    }
    const next = findLatestReviewDraft(draft, application, baseline, pending);
    if (!next) {
      discard();
      return;
    }
    initialValues.current = JSON.stringify(next.values);
    setReviewEdit(key, next);
    setDraftReset((count) => count + 1);
  };

  return {
    draft,
    ready,
    mode: draft?.mode ?? opening?.mode,
    editing,
    error,
    setError,
    draftReset,
    start,
    discard,
    close,
    resume: () => setEditing(true),
    loadLatest,
    ...buildReviewDraftMutators(draft, application, baseline, pending, key, setReviewEdit),
  };
};

const buildReviewDraftMutators = (
  draft: ReviewDraft | undefined,
  application: ReviewProps["application"],
  baseline: ReviewBaseline,
  pending: ReviewProps["application"]["reviews"]["requests"],
  key: string,
  setReviewEdit: ReturnType<typeof useReviewDrafts>["setReviewEdit"],
) => ({
  updateValues: (values: ReviewFormValues) => {
    if (draft) {
      setReviewEdit(key, { ...draft, values });
    }
  },
  keepDraft: () => {
    if (draft) {
      setReviewEdit(key, buildKeptReviewDraft(draft, application, baseline, pending));
    }
  },
});

const findLatestReviewDraft = (
  draft: ReviewDraft,
  application: ReviewProps["application"],
  baseline: ReviewBaseline,
  pending: ReviewProps["application"]["reviews"]["requests"],
): ReviewDraft | null => {
  const contactId = draft.values.contactId;
  const latestAssessment =
    draft.mode === "edit"
      ? application.reviews.assessments.find((item) => item.id === draft.id)
      : application.reviews.assessments.filter((item) => item.contactId === contactId).at(-1);
  if (!latestAssessment || latestAssessment.authorUserId) {
    return null;
  }
  return newReviewDraft(application, baseline.criteriaVersion, pending, {
    mode: "edit",
    contactId: latestAssessment.contactId,
    id: latestAssessment.id,
  });
};

const buildKeptReviewDraft = (
  draft: ReviewDraft,
  application: ReviewProps["application"],
  baseline: ReviewBaseline,
  pending: ReviewProps["application"]["reviews"]["requests"],
): ReviewDraft => {
  if (draft.mode === "edit") {
    const assessment = application.reviews.assessments.find((item) => item.id === draft.id);
    return {
      ...draft,
      ...baseline,
      ...(assessment ? { assessmentVersion: assessment.versions.length } : {}),
    };
  }
  const contactId = draft.values.contactId;
  const request = pending.find((item) => item.contactId === contactId);
  const previous = application.reviews.assessments
    .filter((item) => item.contactId === contactId)
    .at(-1);
  return {
    ...draft,
    ...baseline,
    requestId: request?.id ?? null,
    previousId: previous?.id ?? null,
  };
};
