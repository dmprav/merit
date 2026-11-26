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
  let woken = false;
  setHandler(wake, () => {
    woken = true;
  });
  // Stop, delete and withdrawn consent cancel the step in flight, so its model request ends
  // within a heartbeat instead of running to its timeout. The next step finds the new state.
  let step: CancellationScope | undefined;
  let cancelled = false;
  setHandler(cancelTurn, () => {
    cancelled = true;
    woken = true;
    step?.cancel();
  });

  let failures = 0;
  let idle = timing.idleInitialMs;
  for (let steps = 0; steps < timing.stepsPerRun; steps += 1) {
    woken = false;
    cancelled = false;
    let outcome: Awaited<ReturnType<typeof advanceAssistantConversation>> = "waiting";
    try {
      step = new CancellationScope({ cancellable: true });
      outcome = await step.run(() =>
        advanceAssistantConversation({
          userId: input.userId,
          workspaceSlug: input.workspaceSlug,
          conversationId: input.conversationId,
        }),
      );
      failures = 0;
    } catch (error) {
      if (isCancellation(error) && cancelled && !CancellationScope.current().consideredCancelled) {
        // Only the step was cancelled: look at the conversation again right away.
        idle = timing.idleInitialMs;
        continue;
      }
      if (isCancellation(error)) {
        throw error;
      }
      failures += 1;
      if (failures >= timing.maxFailures) {
        return "unavailable";
      }
    } finally {
      step = undefined;
    }
    // A wake that arrived during the step may follow a change the step did not see.
    if (outcome === "finished" && !woken) {
      return "finished";
    }
    if (outcome === "progressed" || woken) {
      idle = timing.idleInitialMs;
      continue;
    }
    await condition(() => woken, idle);
    idle = Math.min(idle * 2, timing.idleMaxMs);
  }
  return continueAsNew<typeof assistantConversation>(input);
};
