import {
  CancellationScope,
  condition,
  continueAsNew,
  defineSignal,
  isCancellation,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

import type {
  AssistantConversationInput,
  AssistantTiming,
} from "../server/assistant/conversation-work.ts";
import type { AssistantActivities } from "./assistant-activities.ts";

const defaultTiming: AssistantTiming = {
  stepTimeoutMs: 20 * 60_000,
  heartbeatTimeoutMs: 10_000,
  idleInitialMs: 2000,
  idleMaxMs: 15_000,
  maxFailures: 5,
  stepsPerRun: 100,
};

type StepResult =
  | Awaited<ReturnType<AssistantActivities["advanceAssistantConversation"]>>
  | "cancelled"
  | "failed";

// A workflow cannot import server code at run time, so the name repeats `assistantWakeSignal`.
const wake = defineSignal("wake");
const cancelTurn = defineSignal("cancelTurn");

/**
 * Drive one Merit AI conversation: an activity runs one step at a time under the owner's
 * authority, and the workflow ends once the conversation is no longer running. A start,
 * approval, decline, retry or open watch sends the wake signal (signal-with-start), so a start
 * never races a workflow that is finishing.
 *
 * When a step makes no progress, the conversation waits on a lease or a delivery, so the
 * workflow sleeps until a wake or a short, growing timer, then looks again. Postgres holds the
 * state; the input and the results carry identifiers and a status only.
 *
 * The step activity does not retry. A step re-reads the conversation and honors its leases, so
 * running it again is exactly what the next loop does; the workflow decides, and gives up after
 * several failures in a row until reconciliation starts it again.
 */
export const assistantConversation = async (input: AssistantConversationInput) => {
  const timing = { ...defaultTiming, ...input.timing };
  const { advanceAssistantConversation } = proxyActivities<AssistantActivities>({
    taskQueue: input.turnTaskQueue,
    startToCloseTimeout: timing.stepTimeoutMs,
    heartbeatTimeout: timing.heartbeatTimeoutMs,
    retry: { maximumAttempts: 1 },
  });
  const conversation = {
    userId: input.userId,
    workspaceSlug: input.workspaceSlug,
    conversationId: input.conversationId,
  };
  const state: { woken: boolean; cancelled: boolean; step?: CancellationScope } = {
    woken: false,
    cancelled: false,
  };
  setHandler(wake, () => {
    state.woken = true;
  });
  // Stop, delete and withdrawn consent cancel the step in flight, so its model request ends
  // within a heartbeat instead of running to its timeout. The next step finds the new state.
  setHandler(cancelTurn, () => {
    state.cancelled = true;
    state.woken = true;
    state.step?.cancel();
  });

  const runStep = async (): Promise<StepResult> => {
    state.step = new CancellationScope({ cancellable: true });
    try {
      return await state.step.run(() => advanceAssistantConversation(conversation));
    } catch (error) {
      if (!isCancellation(error)) {
        return "failed";
      }
      // Only the step was cancelled: look at the conversation again right away.
      if (state.cancelled && !CancellationScope.current().consideredCancelled) {
        return "cancelled";
      }
      throw error;
    } finally {
      state.step = undefined;
    }
  };

  let failures = 0;
  let idle = timing.idleInitialMs;
  for (let steps = 0; steps < timing.stepsPerRun; steps += 1) {
    state.woken = false;
    state.cancelled = false;
    const result = await runStep();
    failures = result === "failed" ? failures + 1 : result === "cancelled" ? failures : 0;
    if (failures >= timing.maxFailures) {
      return "unavailable";
    }
    // A wake that arrived during the step may follow a change the step did not see.
    if (result === "finished" && !state.woken) {
      return "finished";
    }
    if (result === "progressed" || result === "cancelled" || state.woken) {
      idle = timing.idleInitialMs;
      continue;
    }
    await condition(() => state.woken, idle);
    idle = Math.min(idle * 2, timing.idleMaxMs);
  }
  return continueAsNew<typeof assistantConversation>(input);
};
