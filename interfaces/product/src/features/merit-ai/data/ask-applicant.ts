import { toolDefinition } from "@tanstack/ai/client";
import { z } from "zod";

import { askApplicantInput, askApplicantName } from "../contracts";

/**
 * Merit AI's one proposed action: a message to an applicant. It needs approval, so a run pauses on
 * an interrupt until the person decides. The client registers it so the interrupt can be resolved.
 */
export const askApplicant = toolDefinition({
  name: askApplicantName,
  description: "Send a message to an applicant.",
  inputSchema: askApplicantInput,
  outputSchema: z.object({ sent: z.boolean() }),
  needsApproval: true,
}).client();
