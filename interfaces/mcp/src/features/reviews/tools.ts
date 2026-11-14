import type { ReviewerService, ReviewService } from "@merit/reviews/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import { registerManagerReviewTools } from "./review-tools";
import { registerReviewerTools } from "./reviewer-tools";

export const registerReviewTools = (
  register: RegisterTool,
  actor: McpActor,
  reviews: ReviewService,
  reviewer: ReviewerService,
) => {
  registerManagerReviewTools(register, actor, reviews);
  registerReviewerTools(register, actor, reviewer);
};
