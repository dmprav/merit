import { withHeartbeat } from "@merit/workflows";

import type { AssistantWork } from "../server/assistant/conversation-work";
import type { createAssistantTurns } from "../server/assistant/turns.server";
import type { TurnStep } from "../server/assistant/worker.server";
import { reported } from "./reported";

export type AssistantActivityDependencies = {
  /** False when no model is configured: nothing runs. */
  configured: boolean;
  turns: Pick<ReturnType<typeof createAssistantTurns>, "advance">;
};

/**
 * The turn activity. It runs one step of a conversation under its owner's authority and returns
 * whether the step progressed. It heartbeats while the step runs, so a worker that dies mid-turn
 * is noticed within the heartbeat timeout rather than the step timeout. The workflow cancels
 * the step when the conversation is stopped or deleted or consent is withdrawn; the activity's
 * cancellation signal then aborts the model request at the next heartbeat.
 */
export const createAssistantActivities = ({
  configured,
  turns,
}: AssistantActivityDependencies) => ({
  advanceAssistantConversation: reported(
    "assistant.advance",
    async ({ userId, workspaceSlug, conversationId }: AssistantWork): Promise<TurnStep> =>
      configured
        ? withHeartbeat((cancellation) =>
            turns.advance({ userId }, workspaceSlug, conversationId, cancellation),
          )
        : "finished",
  ),
});

export type AssistantActivities = ReturnType<typeof createAssistantActivities>;
