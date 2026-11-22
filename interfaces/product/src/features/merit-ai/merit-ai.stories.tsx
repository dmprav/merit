import type { Meta, StoryObj } from "@storybook/react-vite";
import { stream, type ConnectConnectionAdapter } from "@tanstack/ai-client";
import { EventType, type StreamChunk } from "@tanstack/ai/client";
import { expect, mocked, waitFor, within } from "storybook/test";

import { PageHeader } from "@merit/ui/page-header";

import { StoryEnvironment } from "../../../tests/storybook";
import { AppPage, AppShell } from "../../app/app-shell";
import { readDemo, startDemo } from "../demo/data/server/demo.functions";
import { DemoGuidance } from "../demo/demo-tools";
import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import type { ScriptId } from "./contracts";
import { createScriptedConnection, type Pace } from "./data/scripts";
import { MeritAiSetup } from "./merit-ai";

const workspace = {
  id: "example",
  slug: "demo-example",
  name: "Alder Foundation",
  kind: "demo" as const,
  demoExpiresAt: "2027-01-25T12:00:00.000Z",
  canWorkOnGrants: true,
  canViewTeam: true,
};

// The demo hands out the bare public ID; the application page's reference adds the title's slug.
const workshopId = "k3m9p2x7t4wq";

const ready = {
  status: "ready" as const,
  workspaceSlug: workspace.slug,
  expiresAt: workspace.demoExpiresAt,
  applicationRef: workshopId,
  roundRef: "local-connections-example",
};

const instant: Pace = { start: 0, word: 0, step: 0 };
const unhurried: Pace = { start: 0, word: 40, step: 0 };

type Connect = (questions: Record<ScriptId, string>) => ConnectConnectionAdapter;

const scripted =
  (pace: Pace, failDecisions = 0): Connect =>
  (questions) =>
    createScriptedConnection({ questions, pace, failDecisions });

/** An answer that arrives a paragraph at a time and then ends, long enough to scroll the panel. */
const paragraphs = Array.from(
  { length: 12 },
  (_, index) =>
    `Paragraph ${index + 1}. The recorded review covers the first submission and relies on the venue that was free then, so the assessment of the budget and of the plan for the workshops has to be read with that in mind.`,
);

const longAnswer: Connect = () =>
  stream(async function* (_messages, _data, signal, input) {
    yield {
      type: EventType.RUN_STARTED,
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "long",
      role: "assistant",
      timestamp: Date.now(),
    };
    for (const paragraph of paragraphs) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (signal?.aborted) {
        return;
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "long",
        delta: `${paragraph}\n\n`,
        timestamp: Date.now(),
      };
    }
    yield { type: EventType.TEXT_MESSAGE_END, messageId: "long", timestamp: Date.now() };
    yield {
      type: EventType.RUN_FINISHED,
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
      outcome: { type: "success" },
    };
  });

/** A run that sends these chunks and then waits, so a story can rest in the middle of an answer. */
const pausedAfter =
  (chunks: StreamChunk[]): Connect =>
  () =>
    stream(async function* (_messages, _data, signal, input) {
      yield {
        type: EventType.RUN_STARTED,
        runId: input.runId,
        threadId: input.threadId,
        timestamp: Date.now(),
      };
      for (const chunk of chunks) {
        yield chunk;
      }
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
    });

const failing: Connect = () =>
  stream(async function* (_messages, _data, _signal, input) {
    yield {
      type: EventType.RUN_STARTED,
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
    };
    yield { type: EventType.RUN_ERROR, message: "The connection dropped.", timestamp: Date.now() };
  });

const step = (id: string, status: "running" | "done"): StreamChunk => ({
  type: EventType.ACTIVITY_SNAPSHOT,
  messageId: id,
  activityType: "step",
  content: {
    label: "Read submission versions 1 and 2",
    summary: "read 2 submissions",
    status,
  },
  replace: true,
  timestamp: Date.now(),
});

const text = (delta: string): StreamChunk[] => [
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: "answer",
    role: "assistant",
    timestamp: Date.now(),
  },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "answer", delta, timestamp: Date.now() },
];

const Preview = ({
  connect,
  isInitiallyOpen = true,
  path = `/app/demo-example/applications/workshop-saturdays-${workshopId}`,
  routePath = "/app/$workspaceSlug/applications/$applicationRef",
  title = "Workshop Saturdays",
}: {
  connect: Connect;
  isInitiallyOpen?: boolean;
  path?: string;
  routePath?: string;
  title?: string;
}) => (
  <MeritAiSetup value={{ createConnection: connect, isInitiallyOpen }}>
    <StoryEnvironment path={path} routePath={routePath} loaderData={{ title }}>
      <WorkspaceNavigationContext
        value={{ workspaces: [workspace], canAdminister: false, draftScope: "demo-example" }}
      >
        <DemoGuidance>
          <AppShell current={{ kind: "workspace", workspace }}>
            <AppPage breadcrumb={null}>
              <PageHeader title={title} />
            </AppPage>
          </AppShell>
        </DemoGuidance>
      </WorkspaceNavigationContext>
    </StoryEnvironment>
  </MeritAiSetup>
);

const meta = {
  title: "Features/Merit AI/Conversation",
  tags: ["!autodocs"],
  component: Preview,
  args: { connect: scripted(instant) },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Merit AI beside a page in a demo workspace. It uses Patterns/Application shell's companion panel, Patterns/Conversation for the thread, and Patterns/Message box to ask. Answers are recorded examples replayed through the real chat client.",
      },
    },
  },
  beforeEach: () => {
    mocked(readDemo).mockResolvedValue(ready);
    mocked(startDemo).mockResolvedValue({ status: "unavailable" });
  },
} satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** The panel's body, which scrolls the thread, once the sheet has faded in below 1400 pixels. */
const panel = async (canvasElement: HTMLElement) => {
  const region = await page(canvasElement).findByRole("region", { name: "Merit AI" });
  await waitFor(() => expect(region).toBeVisible());
  return region;
};

const ask = async (
  canvasElement: HTMLElement,
  userEvent: { type: (element: Element, text: string) => Promise<void> },
  question: string,
) => {
  const body = page(canvasElement);
  await panel(canvasElement);
  await userEvent.type(
    body.getByRole("textbox", { name: "Message to Merit AI" }),
    `${question}{enter}`,
  );
  return body;
};

export const EmptyWithSuggestions: Story = {
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await panel(canvasElement);
    await expect(
      await body.findByRole("button", { name: /What changed in version 2/ }),
    ).toBeVisible();
    await expect(
      body.getByRole("button", { name: /Draft a question to the applicant/ }),
    ).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Remove Workshop Saturdays from the question" }),
    ).toBeVisible();
    await expect(body.getByText("Demo preview: answers are recorded examples.")).toBeVisible();
  },
};

export const EmptyWithoutSuggestions: Story = {
  args: { path: "/app/demo-example/rounds", routePath: "/app/$workspaceSlug/rounds", title: "" },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await panel(canvasElement);
    await expect(body.queryByRole("button", { name: /What changed/ })).toBeNull();
    await expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveFocus();
    await expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveAttribute(
      "placeholder",
      "Ask about this page",
    );
  },
};

export const Working: Story = {
  args: { connect: pausedAfter([step("s1", "running")]) },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    await expect(await body.findByRole("button", { name: "Working…" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(body.getByText("Read submission versions 1 and 2")).toBeVisible();
    await expect(body.getByRole("button", { name: "Stop" })).toBeVisible();
  },
};

export const Streaming: Story = {
  args: {
    connect: pausedAfter([
      step("s1", "running"),
      step("s1", "done"),
      ...text("Version 2 raises the "),
    ]),
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    await expect(await body.findByText(/Version 2 raises the/)).toBeVisible();
    await expect(await body.findByRole("button", { name: "Read 2 submissions" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(body.getByRole("button", { name: "Stop" })).toBeVisible();
  },
};

export const Stopped: Story = {
  args: { connect: scripted(unhurried) },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(
      canvasElement,
      userEvent,
      "What changed in version 2, and do the reviews cover it?",
    );
    await body.findByText(/Version 2/);
    await userEvent.click(body.getByRole("button", { name: "Stop" }));
    await expect(await body.findByText("Stopped. This answer may be incomplete.")).toBeVisible();
  },
};

export const StoppedWhileWorking: Story = {
  args: { connect: pausedAfter([step("s1", "running")]) },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    await userEvent.click(await body.findByRole("button", { name: "Stop" }));
    await expect(await body.findByText("Stopped. This answer may be incomplete.")).toBeVisible();
    await expect(body.getByRole("button", { name: "Stopped before finishing" })).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Stopped before finishing" }));
    await expect(body.getByText("(not finished)")).toBeInTheDocument();
  },
};

export const Failure: Story = {
  args: { connect: failing },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    await expect(await body.findByText("Couldn't finish this answer.")).toBeVisible();
    await expect(body.getByRole("button", { name: "Try again" })).toBeEnabled();
  },
};

export const SuggestedQuestionAnswered: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await panel(canvasElement);
    const body = page(canvasElement);
    await userEvent.click(await body.findByRole("button", { name: /What changed in version 2/ }));
    await expect(await body.findByText(/Version 2 raises the request/)).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Read 2 submissions and checked 2 review requests" }),
    ).toBeVisible();
    await expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveFocus();
  },
};

const proposed = async (
  canvasElement: HTMLElement,
  userEvent: Parameters<NonNullable<Story["play"]>>[0]["userEvent"],
) => {
  await panel(canvasElement);
  const body = page(canvasElement);
  await userEvent.click(
    await body.findByRole("button", { name: /Draft a question to the applicant/ }),
  );
  await expect(await body.findByText("Needs approval")).toBeVisible();
  return body;
};

export const ProposalAwaiting: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await expect(body.getByText("Send a message to Maya Thompson")).toBeVisible();
    await expect(body.getByText("Maya Thompson, Saturday Repair Collective")).toBeVisible();
    await expect(body.getByText("Maya Thompson gets this message by email.")).toBeVisible();
    await expect(body.getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(body.getByRole("button", { name: "Decline" })).toBeEnabled();
  },
};

export const ProposalApproved: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await userEvent.click(body.getByRole("button", { name: "Approve" }));
    await expect(await body.findByText("Approved")).toBeVisible();
    await expect(body.getByText("Demo preview: nothing was sent.")).toBeVisible();
  },
};

export const ProposalDeclined: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await userEvent.click(body.getByRole("button", { name: "Decline" }));
    await expect(await body.findByText("Declined. Nothing was changed.")).toBeVisible();
  },
};

export const ProposalRecording: Story = {
  args: { connect: scripted({ ...instant, decision: 600_000 }) },
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await userEvent.click(body.getByRole("button", { name: "Approve" }));
    // The choice stays where it was pressed, busy, while the other waits.
    const approving = await body.findByRole("button", { name: "Approving…" });
    await expect(approving).toHaveFocus();
    await expect(approving).toHaveAttribute("aria-disabled", "true");
    await expect(body.getByRole("button", { name: "Decline" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const ProposalDecisionFailed: Story = {
  args: { connect: scripted(instant, 1) },
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await userEvent.click(body.getByRole("button", { name: "Approve" }));
    await expect(await body.findByText("Couldn't record your decision. Try again.")).toBeVisible();
    // The failed decision is not also a failed answer.
    await expect(body.queryByText("Couldn't finish this answer.")).toBeNull();
    await expect(body.queryByRole("button", { name: "Try again" })).toBeNull();
    // Both choices stay available; choosing again tries again.
    await expect(body.getByRole("button", { name: "Approve" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(body.getByRole("button", { name: "Decline" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const FreeTextReply: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "Who is the applicant?");
    await expect(
      await body.findByText(
        "In this demo, Merit AI answers suggested questions with recorded examples.",
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(body.getByRole("button", { name: /Draft a question to the applicant/ })).toBeVisible(),
    );
  },
};

/** Whether the element lies within the scrolling panel's visible area. */
const isInView = (element: HTMLElement, scroller: HTMLElement) => {
  const inner = element.getBoundingClientRect();
  const outer = scroller.getBoundingClientRect();
  return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
};

const distanceFromEnd = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

export const FollowsStreamingToTheEnd: Story = {
  args: { connect: longAnswer },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    const scroller = await panel(canvasElement);

    const last = await body.findByText(/Paragraph 12\./, undefined, { timeout: 5000 });
    await waitFor(() => expect(isInView(last, scroller)).toBe(true));
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    await expect(distanceFromEnd(scroller)).toBeLessThan(24);
  },
};

export const LeavesTheScrollWhereThePersonPutIt: Story = {
  args: { connect: longAnswer },
  play: async ({ canvasElement, userEvent }) => {
    const body = await ask(canvasElement, userEvent, "What changed in version 2?");
    const scroller = await panel(canvasElement);

    await waitFor(
      () => expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight + 100),
      { timeout: 5000 },
    );
    scroller.scrollTop = 0;
    await body.findByText(/Paragraph 12\./, undefined, { timeout: 5000 });
    await expect(scroller.scrollTop).toBeLessThan(24);
    await expect(distanceFromEnd(scroller)).toBeGreaterThan(100);

    // Asking again follows the thread to its end once more.
    await userEvent.type(
      body.getByRole("textbox", { name: "Message to Merit AI" }),
      "And the venue?{enter}",
    );
    await waitFor(() => expect(distanceFromEnd(scroller)).toBeLessThan(24));
  },
};

export const FollowsWhatAppearsWhenTheRunSettles: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await panel(canvasElement);
    const body = page(canvasElement);
    const box = await body.findByRole("textbox", { name: "Message to Merit AI" });
    // Two recorded answers fill the panel; the free-text reply and its suggestions follow them.
    const changes = "What changed in version 2, and do the reviews cover it?";
    const turns = [
      { question: changes, reply: /Jules Patel's review/, count: 1 },
      { question: changes, reply: /Jules Patel's review/, count: 2 },
      { question: "Who is the applicant?", reply: /answers suggested questions/, count: 1 },
    ];
    for (const { question, reply, count } of turns) {
      await userEvent.type(box, `${question}{enter}`);
      await waitFor(() => expect(body.getAllByText(reply)).toHaveLength(count));
      await body.findByRole("button", { name: "Send message" });
    }

    const scroller = await panel(canvasElement);
    // The suggestions arrive as the run settles, with no new message to scroll to.
    const suggestion = await body.findByRole("button", {
      name: /Draft a question to the applicant/,
    });
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    await waitFor(() => expect(isInView(suggestion, scroller)).toBe(true));
  },
};

export const Closed: Story = {
  args: { isInitiallyOpen: false },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "Ask Merit AI" })).toBeVisible();
    await expect(body.queryByRole("region", { name: "Merit AI" })).toBeNull();
  },
};
