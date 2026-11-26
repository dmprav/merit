/** The identifiers that address one Merit AI conversation's workflow. Never message content. */
export type AssistantWork = {
  /** The conversation owner, the actor of every step. */
  userId: string;
  workspaceSlug: string;
  conversationId: string;
};

/** How the conversation workflow paces itself. Tests inject shorter values. */
export type AssistantTiming = {
  /** The longest one step may run: it must exceed the 120 s model attempt and a delivery wait. */
  stepTimeoutMs: number;
  /**
   * A worker that stops reporting for this long is treated as dead, and the step as failed.
   * Cancellation reaches the step with a heartbeat, so this also bounds how long a stopped
   * model request keeps running.
   */
  heartbeatTimeoutMs: number;
  /** First wait when nothing progressed; it doubles up to `idleMaxMs` and resets on progress. */
  idleInitialMs: number;
  idleMaxMs: number;
  /** Consecutive failed steps before this run gives up and leaves recovery to reconciliation. */
  maxFailures: number;
  /** Steps per run before it continues as new to keep its history small. */
  stepsPerRun: number;
};

export type AssistantConversationInput = AssistantWork & {
  /** The queue that limits concurrent turns. */
  turnTaskQueue: string;
  timing?: Partial<AssistantTiming>;
};

/** Derived from the committed conversation, so a second start finds the first. */
export const assistantConversationWorkflowId = (conversationId: string) =>
  `assistant-conversation:${conversationId}`;

/** The signal that tells a running conversation workflow to look at its conversation again. */
export const assistantWakeSignal = "wake";

/**
 * The signal that tells a running conversation workflow to cancel the step in flight. Stop,
 * delete and withdrawn consent send it from the web process, which cannot reach the model
 * request the worker holds; the cancelled activity aborts it at its next heartbeat.
 */
export const assistantCancelSignal = "cancelTurn";
