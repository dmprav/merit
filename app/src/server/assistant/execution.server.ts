import { randomUUID } from "node:crypto";

import { change, type Access, type AssistantRuntimeCatalog, type Stored } from "./access.server";
import { applyReceipt, disposition, failNext, nextAction, type Receipt } from "./dispatch.server";
import { beginModelRequest, endModelRequest } from "./model-request.server";
import { conversationState, recordReceipt, type ConversationState } from "./state";

/**
 * How long a claim holds an action: the provider timeout plus the two short transactions around it
 * and a margin. Past it the worker is presumed dead and the action is reported as failed.
 */
const claimWindowMs = 150_000;

/** The group and action that hold this claim, wherever Stop has left them. */
const claimed = (state: ConversationState, claim: string) => {
  for (const group of state.groups) {
    const action = group.actions.find((item) => item.executing?.id === claim);
    if (action) {
      return { group, action };
    }
  }
  return null;
};

/**
 * Apply the outcome of a claimed run under a short lock. The claim decides: an action Stop
 * stopped keeps its place, but a review that committed before Stop took effect is a success, so
 * its receipt is recorded and a retry cannot save it twice. A stopped action whose run saved
 * nothing stays stopped.
 */
const applyOutcome = async (
  state: ConversationState,
  catalog: Parameters<typeof applyReceipt>[1],
  claim: string,
  status: Stored["status"],
  receipt?: Receipt,
) => {
  const found = claimed(state, claim);
  if (!found) {
    return change(state, status);
  }
  const { group, action } = found;
  delete action.executing;
  if (action.status === "stopped") {
    if (receipt?.result.status === "ok") {
      recordReceipt(state, action.preview.name, action.preview.input, {
        ...receipt,
        result: { ...receipt.result, phase: "execution" },
      });
      action.result = receipt.result;
      action.status = "succeeded";
    }
    return change(state, status);
  }
  if (!receipt) {
    action.status = "failed";
    action.result = { status: "failed" };
    action.retry = action.preview;
    recordReceipt(state, action.preview.name, action.preview.input, {
      result: { status: "failed", phase: "execution" },
      dependencies: [],
      citations: [],
    });
    return disposition(state, group);
  }
  return applyReceipt(state, catalog, group, action, receipt);
};

/**
 * The outcome of a run the database already holds must reach the conversation even when it moved
 * on meanwhile, so read it again after a lost revision race.
 */
const record = async (access: Access, claim: string, receipt?: Receipt) => {
  for (;;) {
    const row = await access.read();
    if (!row || !claimed(conversationState.parse(row.state), claim)) {
      return false;
    }
    if (
      await access.locked(row, (state, tools) =>
        applyOutcome(state, tools, claim, row.status, receipt),
      )
    ) {
      return true;
    }
    if (!(await access.consent())) {
      return false;
    }
  }
};

/**
 * An expired claim: the worker that held it is presumed dead. It may have saved before it died, so
 * look for the review under the action's run identity first and record the action as succeeded
 * with it. Nothing is run again. Only when none exists is the action reported as failed.
 */
const reconcileExpired = async (
  state: ConversationState,
  tools: AssistantRuntimeCatalog,
  status: Stored["status"],
) => {
  const next = nextAction(state);
  const claim = next?.action.executing?.id;
  const saved = claim && next ? await tools.recover(next.action.preview) : undefined;
  return claim && saved ? applyOutcome(state, tools, claim, status, saved) : failNext(state);
};

/**
 * Run the next approved slow action: claim it under a short lock, run it with no lock and no
 * surrounding transaction, then apply its outcome under another. The conversation stays readable
 * and Stop works meanwhile; Stop aborts the provider request through `cancellation`, and another
 * worker leaves a live claim alone. An expired claim is reported as failed, never run again.
 */
export const executeSlow = async (access: Access, row: Stored, cancellation?: AbortSignal) => {
  const current = nextAction(conversationState.parse(row.state));
  if (!current) {
    return false;
  }
  if (current.action.executing) {
    return current.action.executing.until > Date.now()
      ? false
      : Boolean(
          await access.locked(row, (state, tools) => reconcileExpired(state, tools, row.status)),
        );
  }
  const claim = randomUUID();
  const work: { signal?: AbortSignal } = {};
  try {
    const held = await access.locked(row, (state) => {
      const next = nextAction(state);
      if (next?.action.status === "approved" && !next.action.executing) {
        next.action.executing = { id: claim, until: Date.now() + claimWindowMs };
        const request = beginModelRequest(row.id, claim);
        work.signal = cancellation ? AbortSignal.any([request, cancellation]) : request;
      }
      return change(state, "running");
    });
    if (!held || !work.signal) {
      return Boolean(held);
    }
    const signal = work.signal;
    let receipt: Receipt | undefined;
    try {
      receipt = await access.catalog(undefined, signal).execute(current.action.preview);
    } catch {
      // The run did not report an outcome; anything it committed is not known to this action.
    }
    return await record(access, claim, receipt);
  } finally {
    endModelRequest(row.id, claim);
  }
};
