import { createContext, useContext, useMemo } from "react";
import { z } from "zod";

import { useDrafts } from "@merit/drafts";
import { saveReviewRequestSchema } from "@merit/reviews/api";

const text = z.string();
const baseline = saveReviewRequestSchema.shape;
export const reviewDraftSchema = z.object({
  mode: z.enum(["request", "record", "edit"]),
  id: text,
  replacesId: text.nullable(),
  revision: baseline.expectedRevision,
  applicationVersion: baseline.expectedApplicationVersion,
  criteriaVersion: baseline.expectedCriteriaVersion,
  values: z.object({
    contactId: text,
    applicationVersion: text,
    criteriaVersion: text,
    date: text,
    position: text,
    amount: text,
    reasoning: text,
    observations: z.array(z.object({ criterionId: z.uuid().nullable(), criterion: text, text })),
    note: text,
  }),
});

export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

export type ReviewFormValues = ReviewDraft["values"];

export const DraftContext = createContext<{
  ready: boolean;
  reviewEdits: Record<string, ReviewDraft | undefined>;
  setReviewEdit: (key: string, draft: ReviewDraft | undefined) => void;
} | null>(null);

export const useReviewDrafts = () => {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("GrantmakingDrafts is required");
  }
  return context;
};

export const useReviewDraftStore = (storageScope?: string) => {
  const {
    drafts: reviewEdits,
    update: setReviewEdits,
    storageUnavailable: unavailable,
    ready,
    status,
  } = useDrafts(storageScope, "reviews", { version: 1, schema: reviewDraftSchema });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        ready,
        reviewEdits,
        setReviewEdit: (key: string, draft: ReviewDraft | undefined) =>
          setReviewEdits((current) => ({ ...current, [key]: draft })),
      }),
      [reviewEdits, setReviewEdits, ready],
    ),
  };
};
