import type { ReviewState } from "@merit/reviews/domain";

import type { ReviewBaseline } from "../../contracts/reviews";
import type { ReviewDraft, ReviewFormValues } from "./drafts";
import { valuesFromContent } from "./values";

type SavedReview =
  | {
      kind: "assessment";
      reviewer: string;
      values: ReviewFormValues;
      recorder: ReviewState["assessments"][number]["versions"][number]["recorder"];
    }
  | { kind: "request"; reviewer: string }
  | { kind: "missing" };

/** Match the same record that editing or recording will change; retain the original draft. */
export const reviewConflictComparison = (
  draft: ReviewDraft,
  state: ReviewState,
  current: ReviewBaseline,
) => {
  const assessment = state.assessments.findLast((item) =>
    draft.mode === "edit" ? item.id === draft.id : item.contactId === draft.values.contactId,
  );
  const request = state.requests.find(
    (item) => item.contactId === draft.values.contactId && item.status === "outstanding",
  );
  const version = assessment?.versions.at(-1);
  const saved: SavedReview =
    assessment && version
      ? {
          kind: "assessment",
          reviewer: assessment.reviewer,
          values: {
            ...valuesFromContent(version.content, assessment.contactId),
            note: version.note,
          },
          recorder: version.recorder,
        }
      : request
        ? { kind: "request", reviewer: request.reviewer }
        : { kind: "missing" };
  const reviewer =
    [...state.assessments, ...state.requests].find(
      (item) => item.contactId === draft.values.contactId,
    )?.reviewer ?? null;
  const changes = (["applicationVersion", "criteriaVersion", "revision"] as const)
    .filter((field) => draft[field] !== current[field])
    .map((field) => ({ field, before: draft[field], after: current[field] }));
  return { saved, draft: draft.values, reviewer, changes };
};

export type ReviewComparison = ReturnType<typeof reviewConflictComparison>;
