import { stream, type Interrupt, type RunFinishedOutcome } from "@tanstack/ai-client";
import { EventType, type StreamChunk } from "@tanstack/ai/client";
import { z } from "zod";

import {
  pageContextSchema,
  scriptIds,
  stepActivity,
  suggestionsActivity,
  type PageContext,
  type ScriptId,
  type StepContent,
  type SuggestionsContent,
} from "../contracts";
import { askApplicantName, type AskApplicantInput } from "../contracts";

/** How long each part of a recorded run takes, in milliseconds. */
export type Pace = {
  start: number;
  word: number;
  step: number;
  /** How long recording the person's decision takes; none when left out. */
  decision?: number;
};

const demoPace: Pace = { start: 400, word: 45, step: 900, decision: 500 };

type Beat = { chunk: StreamChunk; wait: number };

type Run = { runId: string; threadId: string };

const venueCall = "call-venue";

const venueProposal: AskApplicantInput = {
  recipient: { name: "Maya Thompson", organization: "Saturday Repair Collective" },
  message:
    "Hello Maya, thank you for the revised request. Before we review the €22,000 request, could you tell us which venue you will use, whether it is booked, and the dates you have agreed?",
};

const answers = {
  changes: [
    "Version 2 raises the request from €18,000 to €22,000. The extra €4,000 is for hiring a replacement venue, because the free venue is no longer available. The replacement venue isn't booked yet, and the 12 workshops and activities are unchanged.",
    "Sam Morgan's review recommends funding €18,000, but it assessed version 1 and relied on the free venue, so it doesn't cover the change. Jules Patel's review of version 2 is still outstanding.",
  ],
  venue: "The replacement venue isn't booked yet. Here's a question for Maya Thompson:",
  fallback: "In this demo, Merit AI answers suggested questions with recorded examples.",
  fallbackOutsideExample: "Open the Workshop Saturdays application to try them.",
};

const steps = {
  changes: [
    { label: "Read submission versions 1 and 2", summary: "read 2 submissions" },
    { label: "Checked 2 review requests", summary: "checked 2 review requests" },
  ],
  venue: [
    { label: "Read the venue answer (submission version 2)", summary: "read the venue answer" },
  ],
  fallback: [{ label: "Checking the recorded examples", summary: "checked the recorded examples" }],
} satisfies Record<string, Pick<StepContent, "label" | "summary">[]>;

const now = () => Date.now();

const started = ({ runId, threadId }: Run): Beat => ({
  wait: 0,
  chunk: { type: EventType.RUN_STARTED, runId, threadId, timestamp: now() },
});

const finished = ({ runId, threadId }: Run, interrupts?: Interrupt[]): Beat => ({
  wait: 0,
  chunk: {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    timestamp: now(),
    outcome: (interrupts
      ? { type: "interrupt", interrupts }
      : { type: "success" }) satisfies RunFinishedOutcome,
  },
});

const activity = (
  id: string,
  activityType: string,
  content: Record<string, unknown>,
  wait: number,
): Beat => ({
  wait,
  chunk: {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: id,
    activityType,
    content,
    replace: true,
    timestamp: now(),
  },
});

/** A step shows as running, then done once its time has passed. */
const stepBeats = (run: Run, index: number, step: Omit<StepContent, "status">, pace: Pace) => {
  const id = `${run.runId}-step-${index}`;
  return [
    activity(id, stepActivity, { ...step, status: "running" }, 0),
    activity(id, stepActivity, { ...step, status: "done" }, pace.step),
  ];
};

/** Text arrives word by word, the way a model streams it. */
const textBeats = (id: string, paragraphs: readonly string[], pace: Pace): Beat[] => {
  const words = paragraphs.join("\n\n").split(/(?<=\s)/);
  return [
    {
      wait: pace.start,
      chunk: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: id,
        role: "assistant",
        timestamp: now(),
      },
    },
    ...words.map((delta) => ({
      wait: pace.word,
      chunk: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: id,
        delta,
        timestamp: now(),
      } as const,
    })),
    { wait: 0, chunk: { type: EventType.TEXT_MESSAGE_END, messageId: id, timestamp: now() } },
  ];
};

const suggestionBeats = (run: Run): Beat[] => [
  activity(
    `${run.runId}-suggestions`,
    suggestionsActivity,
    { scripts: ["changes", "venue"] } satisfies SuggestionsContent,
    0,
  ),
];

/**
 * The tool-approval interrupt a server sends for a call, recorded from `chat()` with this tool.
 * Its schema hashes tie it to the client's registered tool; the tests catch a drift.
 */
const approvalInterrupt = (runId: string, input: AskApplicantInput): Interrupt => ({
  id: `approval_${venueCall}`,
  reason: "tool_call",
  message: `Approval required to run ${askApplicantName}`,
  toolCallId: venueCall,
  responseSchema: {
    oneOf: [
      {
        type: "object",
        properties: {
          approved: { const: true },
          editedArgs: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
              recipient: {
                type: "object",
                properties: { name: { type: "string" }, organization: { type: "string" } },
                required: ["name", "organization"],
              },
              message: { type: "string" },
            },
            required: ["recipient", "message"],
          },
        },
        required: ["approved"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { approved: { const: false } },
        required: ["approved"],
        additionalProperties: false,
      },
    ],
  },
  metadata: {
    kind: "approval",
    toolName: askApplicantName,
    input,
    "tanstack:interruptBinding": {
      v: 1,
      kind: "tool-approval",
      interruptId: `approval_${venueCall}`,
      toolName: askApplicantName,
      toolCallId: venueCall,
      originalArgs: input,
      inputSchemaHash: "sha256:001ce77ce09b7ab0ff43ac0bb43e42b62cf808125207518824bd87430842ab34",
      approvalSchemaHash: "sha256:22f76d9a1c618a3cfaa891208a14f6e5e6ab1be4ff1c38cc8a8cd1e8fd0c0e4e",
      responseSchemaHash: "sha256:583dfbf499bf88daa100da26eb216241bd4fd5f14ef718d5de5f49f9949066e2",
      interruptedRunId: runId,
      generation: 0,
    },
  },
});

const stepsOf = (run: Run, list: readonly Omit<StepContent, "status">[], pace: Pace) =>
  list.flatMap((step, index) => stepBeats(run, index, step, pace));

const changesRun = (run: Run, pace: Pace): Beat[] => [
  started(run),
  ...stepsOf(run, steps.changes, pace),
  ...textBeats(`${run.runId}-answer`, answers.changes, pace),
  finished(run),
];

const venueRun = (run: Run, pace: Pace): Beat[] => {
  const args = JSON.stringify(venueProposal);
  return [
    started(run),
    ...stepsOf(run, steps.venue, pace),
    ...textBeats(`${run.runId}-answer`, [answers.venue], pace),
    {
      wait: pace.step,
      chunk: {
        type: EventType.TOOL_CALL_START,
        toolCallId: venueCall,
        toolCallName: askApplicantName,
        timestamp: now(),
      },
    },
    {
      wait: pace.word,
      chunk: {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: venueCall,
        delta: args,
        timestamp: now(),
      },
    },
    {
      wait: 0,
      chunk: {
        type: EventType.TOOL_CALL_END,
        toolCallId: venueCall,
        input: venueProposal,
        timestamp: now(),
      },
    },
    finished(run, [approvalInterrupt(run.runId, venueProposal)]),
  ];
};

const fallbackRun = (run: Run, pace: Pace, context: PageContext | undefined): Beat[] => {
  const inExample = context?.isExample === true;
  const reply = inExample
    ? answers.fallback
    : `${answers.fallback} ${answers.fallbackOutsideExample}`;
  return [
    started(run),
    ...stepsOf(run, steps.fallback, pace),
    ...textBeats(`${run.runId}-answer`, [reply], pace),
    ...(inExample ? suggestionBeats(run) : []),
    finished(run),
  ];
};

/** The run that follows the person's decision on the proposal. */
const resumedRun = (run: Run, approved: boolean, pace: Pace): Beat[] => [
  started(run),
  ...(approved
    ? [
        {
          wait: 0,
          chunk: {
            type: EventType.TOOL_CALL_RESULT,
            messageId: `${run.runId}-result`,
            toolCallId: venueCall,
            content: JSON.stringify({ sent: false }),
            timestamp: now(),
          },
        } satisfies Beat,
      ]
    : []),
  { ...finished(run), wait: pace.decision ?? 0 },
];

/** The run that ends in an error because the server could not record the person's decision. */
const failedResumeRun = (
  run: Run,
  interruptedRunId: string | undefined,
  resume: ReadonlyArray<{ interruptId: string }>,
  pace: Pace,
): Beat[] => [
  started(run),
  {
    wait: pace.decision ?? 0,
    chunk: {
      type: EventType.RUN_ERROR,
      runId: run.runId,
      message: "The decision could not be recorded.",
      timestamp: now(),
      metadata: {
        tanstack: {
          interruptErrors: [
            {
              scope: "batch",
              code: "transport",
              message: "The decision could not be recorded.",
              retryable: true,
              threadId: run.threadId,
              interruptedRunId: interruptedRunId ?? "",
              generation: 0,
              interruptIds: resume.map((item) => item.interruptId),
              source: "transport",
            },
          ],
        },
      },
    },
  },
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();

/** The recorded script a question asks for, only when the example page is attached. */
const matchScript = (
  text: string,
  questions: Record<ScriptId, string>,
  context: PageContext | undefined,
): ScriptId | undefined =>
  context?.isExample
    ? scriptIds.find((id) => normalize(questions[id]) === normalize(text))
    : undefined;

const sleep = (milliseconds: number, signal: AbortSignal | undefined) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(completed);
    };

    const onAbort = () => finish(false);

    const timer = setTimeout(() => finish(true), milliseconds);
    signal?.addEventListener("abort", onAbort);
  });

const replay = async function* (beats: readonly Beat[], signal: AbortSignal | undefined) {
  for (const beat of beats) {
    if (beat.wait > 0 ? !(await sleep(beat.wait, signal)) : signal?.aborted) {
      return;
    }
    yield beat.chunk;
  }
};

const lastQuestion = (messages: Parameters<Parameters<typeof stream>[0]>[0]) => {
  const message = messages.findLast((item) => item.role === "user");
  if (!message) {
    return "";
  }
  if ("parts" in message) {
    return message.parts.map((part) => (part.type === "text" ? part.content : "")).join("");
  }
  return typeof message.content === "string" ? message.content : "";
};

const contextSchema = z.object({ context: pageContextSchema });

const readContext = (forwardedProps: unknown) => {
  const parsed = contextSchema.safeParse(forwardedProps);
  return parsed.success ? parsed.data.context : undefined;
};

const approvedIn = (resume: ReadonlyArray<{ payload?: unknown }>) =>
  resume.some(
    (item) =>
      typeof item.payload === "object" &&
      item.payload !== null &&
      "approved" in item.payload &&
      item.payload.approved === true,
  );

/**
 * A stand-in for the server transport until a backend exists: it replays recorded AG-UI chunks
 * through the real chat client, so streaming, stopping and approval behave as they will for real.
 */
export const createScriptedConnection = ({
  questions,
  pace = demoPace,
  failDecisions = 0,
}: {
  questions: Record<ScriptId, string>;
  pace?: Pace;
  /** How many decisions fail to record before one succeeds; previews and tests rehearse the failure. */
  failDecisions?: number;
}) => {
  let failures = failDecisions;
  return stream((messages, _data, signal, input) => {
    const run = { runId: input.runId, threadId: input.threadId };
    if (input.resume) {
      if (failures > 0) {
        failures -= 1;
        return replay(failedResumeRun(run, input.parentRunId, input.resume, pace), signal);
      }
      return replay(resumedRun(run, approvedIn(input.resume), pace), signal);
    }
    const context = readContext(input.forwardedProps);
    const script = matchScript(lastQuestion(messages), questions, context);
    const beats =
      script === "changes"
        ? changesRun(run, pace)
        : script === "venue"
          ? venueRun(run, pace)
          : fallbackRun(run, pace, context);
    return replay(beats, signal);
  });
};
