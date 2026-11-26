import { randomUUID } from "node:crypto";

import { change, type Access, type AssistantRuntimeCatalog, type Stored } from "./access.server";
import { disposition, nextAction } from "./dispatch.server";
import {
  conversationState,
  recordReceipt,
  type ConversationState,
  type DeliveryTicket,
} from "./state";

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

/** Consecutive failed reads of a message before the delivery is recorded as failed. */
const failedReadLimit = 10;

type Attempt = { id: string; errors?: number };

/**
 * The action Stop left with a started delivery and no recorded outcome. Stop keeps its ticket and
 * attempt, so the conversation can still record whether the email was sent.
 */
export const unsettledDelivery = (state: ConversationState) =>
  state.groups
    .flatMap((group) => group.actions)
    .find((action) => action.status === "stopped" && action.delivery && action.deliveryAttempt);

const ask = (access: Access, ticket: DeliveryTicket) =>
  access
    .catalog()
    .deliver(ticket)
    // A read that failed says nothing about the message; the next step asks again.
    .catch(() => "error" as const);

/**
 * Handle what the message answered: record a final status once, leave a pending one for the next
 * wake without writing, and give up on a message that cannot be read after repeated errors.
 */
const record = async (
  access: Access,
  row: Stored,
  attempt: Attempt,
  outcome: DeliveryOutcome | "error",
) => {
  if (outcome === "pending") {
    return false;
  }
  if (outcome !== "error") {
    return recordDelivery(access, attempt.id, outcome);
  }
  const errors = (attempt.errors ?? 0) + 1;
  if (errors >= failedReadLimit) {
    return recordDelivery(access, attempt.id, "failed");
  }
  await access.locked(row, (state) => {
    const saved = state.groups
      .flatMap((group) => group.actions)
      .find((item) => item.deliveryAttempt?.id === attempt.id)?.deliveryAttempt;
    if (saved) {
      saved.errors = errors;
    }
    return change(state, row.status);
  });
  return false;
};

/**
 * Settle a delivery after Stop: ask where the message stands and record the outcome once it is
 * final. This is all a stopped conversation does, so Stop never leaves the email unaccounted for.
 */
export const settleStopped = async (access: Access, row: Stored) => {
  const action = unsettledDelivery(conversationState.parse(row.state));
  if (!action?.delivery || !action.deliveryAttempt) {
    return false;
  }
  return record(access, row, action.deliveryAttempt, await ask(access, action.delivery));
};

/**
 * One delivery step. It never waits for the email: the reviewer-message workflow sends it, and
 * each step asks where the message stands. `pending` answers `false` without writing, so the
 * conversation waits for its next wake with the action still `delivering`; a final status is
 * recorded once.
 */
export const deliverNext = async (access: Access, row: Stored) => {
  const next = nextAction(conversationState.parse(row.state));
  const existing = next?.action.deliveryAttempt;
  if (existing && next.action.delivery) {
    return record(access, row, existing, await ask(access, next.action.delivery));
  }
  const id = randomUUID();
  const claimed = await access.locked(row, (state) => {
    const pending = nextAction(state);
    if (!pending?.action.delivery || pending.action.status !== "delivering") {
      throw new Error("No pending delivery.");
    }
    pending.action.deliveryAttempt = { id };
    return change(state, "running");
  });
  if (!claimed) {
    return false;
  }
  const sent: { outcome?: ReturnType<typeof ask> } = {};
  // A concurrent Stop or Delete can invalidate the durable claim before the message is touched.
  // Start the pool-backed operation under this last gate, then release the chat lock.
  const dispatched = await access.locked(claimed, (state) => {
    const pending = nextAction(state);
    if (!pending?.action.delivery || pending.action.deliveryAttempt?.id !== id) {
      throw new Error("No claimed delivery.");
    }
    sent.outcome = ask(access, pending.action.delivery);
    return change(state, "running");
  });
  if (!dispatched || !sent.outcome) {
    return false;
  }
  return record(access, dispatched, { id }, await sent.outcome);
};
