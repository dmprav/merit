import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import { registerIntakeTools } from "./intake-tools";
import type { FundingRoundOperations } from "./operations";
import { registerPreparationTools } from "./preparation-tools";
import { registerFundingReadingTools } from "./reading-tools";
import { registerRecommendationTools } from "./recommendation-tools";
import { registerReviewTools } from "./review-tools";

export const registerFundingRoundTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: FundingRoundOperations,
  origin: string,
) => {
  registerFundingReadingTools(register, actor, workspace, origin);
  registerPreparationTools(register, actor, workspace);
  registerIntakeTools(register, actor, workspace);
  registerRecommendationTools(register, actor, workspace);
  registerReviewTools(register, actor, workspace);
};
