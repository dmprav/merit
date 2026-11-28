import type { z } from "zod";

import type { IntakeApplication, MaterialVersion } from "@merit/applications/domain";
import type { saveReviewRequestSchema } from "@merit/reviews/api";
import type { ReviewSaveError } from "@merit/reviews/api";
import type { ReviewRevision } from "@merit/reviews/domain";
import type { ReviewChange, ReviewState } from "@merit/reviews/domain";
import type { CriteriaVersion, FundingRound } from "@merit/rounds/domain";

import type { ManagerReviewerData } from "./reviewer";

type ReviewSaveResult =
  | { status: "ok"; revision: ReviewRevision }
  | { status: "invalid"; error: ReviewSaveError }
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type ReviewProblem =
  | Exclude<ReviewSaveResult, { status: "ok" }>
  | { status: "request_conflict" };

export type ReviewRequest = (contactId: string, id: string) => Promise<ReviewProblem | null>;

export type ReviewApplication = Pick<IntakeApplication, "title" | "version"> & {
  reviews: ReviewState;
};

export type ReviewRound = Pick<FundingRound, "criteria" | "criteriaVersion" | "criteriaHistory">;

export type ReviewBaseline = Readonly<{
  revision: ReviewRevision;
  applicationVersion: MaterialVersion;
  criteriaVersion: CriteriaVersion;
}>;

export type ReviewData = {
  participation?: ManagerReviewerData;
  draftKey: string;
  workspaceSlug: string;
  save: (change: ReviewChange, baseline: ReviewBaseline) => Promise<ReviewSaveResult>;
  refresh: () => Promise<void>;
};

export type ReviewProps = {
  application: ReviewApplication;
  round: ReviewRound;
  availableApplicationVersions?: readonly ReviewBaseline["applicationVersion"][];
  selectedId?: string;
  onInspectVersion?: (version: ReviewBaseline["applicationVersion"]) => void;
  data?: ReviewData | null;
};

export type ReviewTransport = (
  input: z.infer<typeof saveReviewRequestSchema>,
) => Promise<ReviewSaveResult>;
