import type { Actor } from "@merit/auth";
import type { ReviewService } from "@merit/reviews/api";

import { createAiReviewTools } from "./ai-reviews";
import {
  createManagerAssignmentTools,
  type ManagerAssignmentOperations,
} from "./manager-assignments";
import { createManagerReviewTools } from "./manager-reviews";

export const createManagerTools = (
  actor: Actor,
  reviews: ReviewService,
  reviewer: ManagerAssignmentOperations,
) => [
  ...createManagerReviewTools(actor, reviews),
  ...createAiReviewTools(actor, reviews),
  ...createManagerAssignmentTools(actor, reviewer),
];
