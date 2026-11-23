import { randomUUID } from "node:crypto";

import { change, type Access, type AssistantRuntimeCatalog, type Stored } from "./access.server";
import { disposition, nextAction } from "./dispatch.server";
import { conversationState, recordReceipt } from "./state";

type DeliveryOutcome = Awaited<ReturnType<AssistantRuntimeCatalog["deliver"]>>;

const deliveryOutcome = (row: Stored, attemptId: string, status: DeliveryOutcome) => {
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

const recordDelivery = async (access: Access, attemptId: string, status: DeliveryOutcome) => {
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

export const deliverNext = async (access: Access, row: Stored) => {
  const id = randomUUID();
  const claimed = await access.locked(row, (state) => {
    const next = nextAction(state);
    if (!next?.action.delivery || next.action.status !== "delivering") {
      throw new Error("No pending delivery.");
    }
    next.action.deliveryAttempt = { id, until: Date.now() + 120_000 };
    return change(state, "running");
  });
  if (!claimed) {
    return false;
  }
  const live = await access.read();
  if (live?.revision !== claimed.revision || !(await access.consent())) {
    return false;
  }
  const ticket = nextAction(conversationState.parse(live.state))?.action.delivery;
  if (!ticket) {
    return false;
  }
  const status = await access
    .catalog()
    .deliver(ticket)
    .catch(() => "failed" as const);
  return recordDelivery(access, id, status);
};
