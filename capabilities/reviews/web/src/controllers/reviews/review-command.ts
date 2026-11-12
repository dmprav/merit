import { assessmentInputSchema, type ReviewChange, type ReviewState } from "@merit/reviews/domain";

import type { ReviewBaseline } from "../../contracts/reviews";
import type { ReviewDraft, ReviewFormValues } from "./drafts";
import { contentFromValues } from "./values";

export const reviewCommand = (
  draft: ReviewDraft,
  values: ReviewFormValues,
  state: ReviewState,
): { change: ReviewChange; baseline: ReviewBaseline } => {
  let change: ReviewChange;
  switch (draft.mode) {
    case "request":
      change = {
        action: "request",
        id: draft.id,
        contactId: values.contactId,
        replacesId: draft.replacesId,
      };
      break;
    case "edit":
      change = {
        action: "edit",
        id: draft.id,
        content: assessmentInputSchema.parse(contentFromValues(values)),
        note: values.note,
      };
      break;
    case "record": {
      const previous = state.assessments
        .filter((item) => item.contactId === values.contactId)
        .at(-1);
      const request = state.requests.find(
        (item) => item.status === "outstanding" && item.contactId === values.contactId,
      );
      change = {
        action: "record",
        id: draft.id,
        contactId: values.contactId,
        requestId: request?.id ?? null,
        previousId: previous?.id ?? null,
        content: assessmentInputSchema.parse(contentFromValues(values)),
      };
      break;
    }
  }

  return {
    change,
    baseline: {
      revision: draft.revision,
      applicationVersion: draft.applicationVersion,
      criteriaVersion: draft.criteriaVersion,
    },
  };
};
