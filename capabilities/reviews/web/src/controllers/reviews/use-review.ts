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
  const conflict = Boolean(
    draft &&
    (draft.revision !== state.revision ||
      draft.applicationVersion !== application.version ||
      draft.criteriaVersion !== criteriaVersion),
  );

  const saveDraft = async (values: ReviewFormValues): Promise<ReviewProblem | null> => {
    if (!draft || conflict) {
      return { status: "conflict" };
    }

    const { change, baseline } = reviewCommand(draft, values, state);
    const failure = await save(change, baseline);
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
  replacesId: string | null;
};

const newReviewDraft = (
  application: ReviewProps["application"],
  criteriaVersion: ReviewBaseline["criteriaVersion"],
  pending: ReviewProps["application"]["reviews"]["requests"],
  { mode, contactId, id, replacesId }: ReviewOpening,
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
    replacesId,
    revision: application.reviews.revision,
    applicationVersion: application.version,
    criteriaVersion,
    values: valuesFromContent(content, contactId),
  };
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
  const [opening, setOpening] = useState<ReviewOpening | null>(null);
  const [error, setError] = useState<ReviewProblem | null>(null);
  const initialValues = useRef<string | null>(null);

  const initialize = useCallback(
    (request: ReviewOpening) => {
      const next = newReviewDraft(application, baseline.criteriaVersion, pending, request);
      initialValues.current = JSON.stringify(next.values);
      setReviewEdit(key, next);
    },
    [application, baseline.criteriaVersion, pending, key, setReviewEdit],
  );

  useEffect(() => {
    if (ready && opening && editing) {
      if (!draft) {
        initialize(opening);
      }
      setOpening(null);
    }
  }, [ready, opening, editing, draft, initialize]);

  const start = (
    mode: ReviewDraft["mode"],
    contactId = "",
    id: string = crypto.randomUUID(),
    replacesId: string | null = null,
  ) => {
    setEditing(true);
    setError(null);
    const request = { mode, contactId, id, replacesId };
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

  return {
    draft,
    ready,
    mode: draft?.mode ?? opening?.mode,
    editing,
    error,
    setError,
    start,
    discard,
    close,
    resume: () => setEditing(true),
    updateValues: (values: ReviewFormValues) => {
      if (draft) {
        setReviewEdit(key, { ...draft, values });
      }
    },
    keepDraft: () => {
      if (draft) {
        setReviewEdit(key, {
          ...draft,
          ...baseline,
        });
      }
    },
  };
};
