import type { z } from "zod";

import type { MaterialVersion } from "@merit/applications/domain";
import type { RoundView, ApplicationRoundContext } from "@merit/grantmaking/api";
import type { saveReviewRequestSchema } from "@merit/reviews/api";
import type { ReviewSaveError } from "@merit/reviews/api";
import type { ReviewRevision } from "@merit/reviews/domain";
import type { ReviewChange } from "@merit/reviews/domain";
import type { CriteriaVersion } from "@merit/rounds/domain";

import type { ManagerReviewerData } from "./reviewer";

type ReviewSaveResult =
  | { status: "ok"; revision: ReviewRevision }
  | { status: "invalid"; error: ReviewSaveError }
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type ReviewProblem =
  | Exclude<ReviewSaveResult, { status: "ok" }>
  | { status: "request_conflict" };

export type ReviewRequest = (contactId: string, id: string) => Promise<ReviewProblem | null>;

export type ReviewApplication = Pick<
  RoundView["applications"][number],
  "title" | "version" | "reviews"
>;

export type ReviewRound = Pick<
  ApplicationRoundContext,
  "criteria" | "criteriaVersion" | "criteriaHistory"
>;

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
