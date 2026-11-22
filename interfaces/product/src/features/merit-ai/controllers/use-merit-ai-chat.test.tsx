import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import type { PageContext } from "../contracts";
import { askApplicant } from "../data/ask-applicant";
import { createScriptedConnection, type Pace } from "../data/scripts";
import { en } from "../messages.en";
import type { Turn } from "./turns";
import { useMeritAiChat } from "./use-merit-ai-chat";

const instant: Pace = { start: 0, word: 0, step: 0 };
const questions = { changes: en.suggestions.changes, venue: en.suggestions.venue };
const example: PageContext = {
  applicationRef: "workshop-saturdays-k3m9p2x7t4wq",
  isExample: true,
};
const elsewhere: PageContext = { applicationRef: "boat-repairs-b8d5f1h6j2nr", isExample: false };

const setup = (context: PageContext | undefined, pace: Pace = instant, failDecisions = 0) =>
  renderHook(() =>
    useMeritAiChat({
      connection: createScriptedConnection({ questions, pace, failDecisions }),
      tools: [askApplicant],
      context,
    }),
  );

const parts = (turn: Turn | undefined) => turn?.parts ?? [];

const textOf = (turn: Turn | undefined) =>
  parts(turn)
    .map((part) => (part.type === "text" ? part.content : ""))
    .join("");

const partTypes = (turn: Turn | undefined) => parts(turn).map((part) => part.type);

const proposalOf = (turn: Turn | undefined) =>
  parts(turn).find((part) => part.type === "tool-call");

/** Sends a question and waits for the whole answer: a new turn that has settled. */
const ask = async (chat: ReturnType<typeof setup>["result"], text: string) => {
  const before = chat.current.turns.length;
  act(() => chat.current.send(text));
  await waitFor(() => {
    expect(chat.current.turns.length).toBeGreaterThan(before + 1);
    expect(chat.current.isBusy).toBe(false);
  });
};

it("answers the version question from the recorded script, step by step", async () => {
  const { result } = setup(example);

  await ask(result, en.suggestions.changes);

  const [question, answer] = result.current.turns;
  expect(textOf(question)).toBe(en.suggestions.changes);
  const steps = parts(answer).flatMap((part) => (part.type === "activity" ? [part.content] : []));
  expect(steps).toEqual([
    {
      label: "Read submission versions 1 and 2",
      summary: "read 2 submissions",
      status: "done",
    },
    { label: "Checked 2 review requests", summary: "checked 2 review requests", status: "done" },
  ]);
  const paragraphs = textOf(answer).split("\n\n");
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0]).toContain("raises the request from €18,000 to €22,000");
  expect(paragraphs[1]).toContain("Jules Patel's review of version 2 is still outstanding.");
  expect(result.current.draft).toBe("");
});

it("matches a typed question to its script regardless of case and punctuation", async () => {
  const { result } = setup(example);

  await ask(result, "  what changed in version 2 and do the reviews cover it  ");

  expect(textOf(result.current.turns[1])).toContain("Version 2 raises the request");
});

it("proposes the venue message and waits for the person's decision", async () => {
  const { result } = setup(example);

  await ask(result, en.suggestions.venue);

  const answer = result.current.turns[1];
  expect(textOf(answer)).toBe(
    "The replacement venue isn't booked yet. Here's a question for Maya Thompson:",
  );
  const proposal = proposalOf(answer);
  expect(proposal).toMatchObject({
    name: "ask_applicant",
    state: "approval-requested",
    input: { title: "Ask Maya Thompson to confirm the venue" },
  });
});

// An interrupt the client cannot bind to its registered tool would ignore this decision, so this
// also guards the recorded interrupt against drifting from the tool's schema.
it("approves the proposal through the interrupt and resumes the run", async () => {
  const { result } = setup(example);
  await ask(result, en.suggestions.venue);

  act(() => result.current.approve());
  await waitFor(() => expect(partTypes(result.current.turns[1])).toContain("tool-result"));
  await waitFor(() => expect(result.current.isBusy).toBe(false));

  expect(proposalOf(result.current.turns[1])).toMatchObject({ approval: { approved: true } });
});

it("declines the proposal without recording a result", async () => {
  const { result } = setup(example);
  await ask(result, en.suggestions.venue);

  act(() => result.current.decline());
  await waitFor(() =>
    expect(proposalOf(result.current.turns[1])).toMatchObject({ approval: { approved: false } }),
  );
  await waitFor(() => expect(result.current.isBusy).toBe(false));

  expect(proposalOf(result.current.turns[1])).toMatchObject({
    approval: { approved: false },
  });
  expect(partTypes(result.current.turns[1])).not.toContain("tool-result");
});

it("declines a waiting proposal before it answers a new question", async () => {
  const { result } = setup(example);
  await ask(result, en.suggestions.venue);

  await ask(result, en.suggestions.changes);

  const proposal = proposalOf(result.current.turns[1]);
  expect(proposal).toMatchObject({ approval: { approved: false } });
  expect(result.current.turns).toHaveLength(4);
  expect(textOf(result.current.turns[3])).toContain("Version 2 raises the request");
});

it.each([
  ["a free-typed question on the example page", example, "Who is the applicant?", true],
  ["a suggested question without the example attached", undefined, en.suggestions.changes, false],
  ["a suggested question on another page", elsewhere, en.suggestions.venue, false],
])("replies with the recorded-examples note to %s", async (_name, context, question, inExample) => {
  const { result } = setup(context);

  await ask(result, question);

  const answer = result.current.turns[1];
  const reply = "In this demo, Merit AI answers suggested questions with recorded examples.";
  expect(textOf(answer)).toBe(
    inExample ? reply : `${reply} Open the Workshop Saturdays application to try them.`,
  );
  expect(
    parts(answer).some((part) => part.type === "activity" && part.activityType === "suggestions"),
  ).toBe(inExample);
  expect(parts(answer).find((part) => part.type === "activity")).toMatchObject({
    content: { label: "Checking the recorded examples" },
  });
});

it("stops mid-answer, keeps what streamed, and remembers where it stopped", async () => {
  const { result } = setup(example, { start: 0, word: 20, step: 0 });

  act(() => result.current.send(en.suggestions.changes));
  await waitFor(() => expect(textOf(result.current.turns[1]).length).toBeGreaterThan(10));
  act(() => result.current.stop());
  await waitFor(() => expect(result.current.isBusy).toBe(false));

  const partial = textOf(result.current.turns[1]);
  expect(partial).not.toBe("");
  expect(partial).not.toContain("Jules Patel");
  expect(result.current.stoppedAt).toBe(result.current.turns.at(-1)?.id);

  act(() => result.current.send("Who is the applicant?"));
  expect(result.current.stoppedAt).toBeNull();
});

it("announces each finished answer, and the outcome of a decision once it is recorded", async () => {
  const { result } = setup(example);

  await ask(result, en.suggestions.venue);
  expect(result.current.announcement).toMatchObject({
    sequence: 1,
    kind: "answer",
    turnId: result.current.turns[1]?.id,
  });

  act(() => result.current.approve());
  await waitFor(() => expect(result.current.announcement).toMatchObject({ sequence: 2 }));
  expect(result.current.announcement?.kind).toBe("approved");

  // The next question is answered, not decided: the declined outcome of the replaced proposal is
  // not announced over it.
  await ask(result, en.suggestions.changes);
  expect(result.current.announcement).toMatchObject({ kind: "answer", sequence: 3 });
});

it("announces a declined proposal as declined", async () => {
  const { result } = setup(example);
  await ask(result, en.suggestions.venue);

  act(() => result.current.decline());

  await waitFor(() => expect(result.current.announcement?.kind).toBe("declined"));
});

it("keeps the proposal open when its decision cannot be recorded, and records a second choice", async () => {
  const { result } = setup(example, instant, 1);
  await ask(result, en.suggestions.venue);
  const proposal = proposalOf(result.current.turns[1]);

  act(() => result.current.approve());
  await waitFor(() => expect(result.current.decisionFailed).toBe(true));
  await waitFor(() => expect(result.current.isBusy).toBe(false));

  expect(result.current.openProposal).toBe(proposal?.id);
  expect(result.current.recording).toBeNull();
  expect(result.current.announcement).toMatchObject({ sequence: 1, kind: "answer" });

  act(() => result.current.decline());
  await waitFor(() => expect(result.current.decisionFailed).toBe(false));
  await waitFor(() => expect(result.current.announcement?.kind).toBe("declined"));
  expect(result.current.openProposal).toBeUndefined();
  expect(proposalOf(result.current.turns[1])).toMatchObject({ approval: { approved: false } });
});
