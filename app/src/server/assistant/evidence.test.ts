import { expect, it } from "vite-plus/test";

import { providerHistory } from "./context.server";
import { readObservation } from "./observation.server";
import { initialState, recordAnswer, recordReceipt } from "./state";

const submission = (recordId: string, version: string) => ({
  kind: "submission",
  label: recordId,
  recordId,
  version,
});

it("reopens a citation whose tool result has fallen outside the provider history", () => {
  const state = initialState();
  recordReceipt(
    state,
    "get_submission",
    {},
    {
      result: { status: "ok", score: 8 },
      dependencies: [],
      citations: [submission("A", "1"), submission("B", "2")],
    },
  );
  for (let index = 0; index < 128; index++) {
    state.messages.push({ role: "user", text: "Continue" });
  }
  expect(recordAnswer(state, "Submission B scored eight [E2].")).toBe(true);
  const history = providerHistory(state.messages);
  expect(history).not.toContainEqual(expect.objectContaining({ role: "tool" }));
  expect(history).toContainEqual({ role: "assistant", content: "Submission B scored eight [E2]." });

  const input = { observation: "E2", section: "result", cursor: 0 };
  expect(readObservation(state.messages, input)).toMatchObject({
    result: { observation: 0, text: '{"status":"ok","score":8}' },
    citations: [submission("B", "2")],
  });
  expect(readObservation(state.messages, { ...input, observation: "E3" }).result.status).toBe(
    "invalid_input",
  );
});

it("requires a citation from a newly inspected version when an older key cites the same record", () => {
  const state = initialState();
  recordReceipt(
    state,
    "inspect",
    {},
    {
      dependencies: [],
      result: { status: "ok" },
      citations: [submission("A", "1"), submission("B", "1")],
    },
  );
  state.messages.push({ role: "user", text: "Compare the scores." });
  recordReceipt(
    state,
    "inspect",
    {},
    {
      dependencies: [],
      result: { status: "ok" },
      citations: [submission("A", "2"), submission("C", "1")],
    },
  );
  expect(recordAnswer(state, "A scored eight [E1]. C scored five [E4].")).toBe(false);
  expect(recordAnswer(state, "A improved from six [E1] to eight [E3].")).toBe(true);
  expect(recordAnswer(state, "B previously scored seven [E2].")).toBe(true);
  const input = { observation: "E1", section: "result", cursor: 0 };
  recordReceipt(state, "read_observation", input, readObservation(state.messages, input));
  expect(recordAnswer(state, "A originally scored six [E1].")).toBe(true);
});
