import { randomUUID } from "node:crypto";

import { change, type Access, type AssistantRuntimeCatalog, type Stored } from "./access.server";
import { disposition, nextAction } from "./dispatch.server";
import { conversationState, recordReceipt } from "./state";

type DeliveryOutcome = Awaited<ReturnType<AssistantRuntimeCatalog["deliver"]>>;

const deliveryOutcome = (
  row: Stored,
  attemptId: string,
  status: Exclude<DeliveryOutcome, "pending">,
) => {
  const state = conversationState.parse(row.state);
  const group = state.groups.find((item) =>
    item.actions.some((action) => action.deliveryAttempt?.id === attemptId),
  );
  const action = group?.actions.find((item) => item.deliveryAttempt?.id === attemptId);
  if (!group || !action) {
    return null;
  }
  const wasPending = action.status === "delivering";
  delete action.deliveryAttempt;
  action.result = { ...action.result, delivery: status };
  action.status = status === "sent" ? "succeeded" : "failed";
  if (status === "unavailable") {
    delete action.delivery;
  }
  recordReceipt(state, action.preview.name, action.preview.input, {
    result: { status: action.status, delivery: status },
    dependencies: [],
    citations: [],
  });
  return wasPending && row.status === "running"
    ? disposition(state, group)
    : change(state, row.status);
};

const recordDelivery = async (
  access: Access,
  attemptId: string,
  status: Exclude<DeliveryOutcome, "pending">,
) => {
  for (;;) {
    const row = await access.read();
    if (!row) {
      return false;
    }
    const outcome = deliveryOutcome(row, attemptId, status);
    if (!outcome) {
      return false;
    }
    if (await access.locked(row, () => outcome)) {
      return true;
    }
    if (!(await access.consent())) {
      return false;
    }
  }
};

/**
 * One delivery step. It never waits for the email: the reviewer-message workflow sends it, and
 * each step asks where the message stands. `pending` answers `false`, so the conversation waits
 * for its next wake with the action still `delivering`; a final status is recorded once.
 */
export const deliverNext = async (access: Access, row: Stored) => {
  const existing = nextAction(conversationState.parse(row.state))?.action.deliveryAttempt?.id;
  const id = existing ?? randomUUID();
  const claimed = existing
    ? row
    : await access.locked(row, (state) => {
        const next = nextAction(state);
        if (!next?.action.delivery || next.action.status !== "delivering") {
          throw new Error("No pending delivery.");
        }
        next.action.deliveryAttempt = { id };
        return change(state, "running");
      });
  if (!claimed) {
    return false;
  }
  const sent: { outcome?: Promise<DeliveryOutcome> } = {};
  // A concurrent Stop or Delete can invalidate the durable claim before the message is touched.
  // Start the pool-backed operation under this last gate, then release the chat lock.
  const dispatched = await access.locked(claimed, (state) => {
    const next = nextAction(state);
    if (!next?.action.delivery || next.action.deliveryAttempt?.id !== id) {
      throw new Error("No claimed delivery.");
    }
    // A read that failed says nothing about the message; the next step asks again.
    sent.outcome = access
      .catalog()
      .deliver(next.action.delivery)
      .catch(() => "pending" as const);
    return change(state, "running");
  });
  if (!dispatched || !sent.outcome) {
    return false;
  }
  const outcome = await sent.outcome;
  return outcome === "pending" ? false : recordDelivery(access, id, outcome);
};
