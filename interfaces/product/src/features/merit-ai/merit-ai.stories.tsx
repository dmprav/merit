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

const ready = {
  status: "ready" as const,
  workspaceSlug: workspace.slug,
  expiresAt: workspace.demoExpiresAt,
  applicationRef: "workshop-example",
  roundRef: "local-connections-example",
};

const instant: Pace = { start: 0, word: 0, step: 0 };
const unhurried: Pace = { start: 0, word: 40, step: 0 };

type Connect = (questions: Record<ScriptId, string>) => ConnectConnectionAdapter;

const scripted =
  (pace: Pace): Connect =>
  (questions) =>
    createScriptedConnection({ questions, pace });

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
  path = "/app/demo-example/applications/workshop-example",
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

const panel = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole("region", { name: "Merit AI" });

const ask = async (
  canvasElement: HTMLElement,
  userEvent: { type: (element: Element, text: string) => Promise<void> },
  question: string,
) => {
  const body = within(await panel(canvasElement));
  await userEvent.type(
    body.getByRole("textbox", { name: "Message to Merit AI" }),
    `${question}{enter}`,
  );
  return body;
};

export const EmptyWithSuggestions: Story = {
  play: async ({ canvasElement }) => {
    const body = within(await panel(canvasElement));
    await expect(
      await body.findByRole("button", { name: /What changed in version 2/ }),
    ).toBeVisible();
    await expect(
      body.getByRole("button", { name: /Draft a question to the applicant/ }),
    ).toBeVisible();
    await expect(body.getByText("Workshop Saturdays")).toBeVisible();
    await expect(body.getByText("Demo preview: answers are recorded examples.")).toBeVisible();
  },
};

export const EmptyWithoutSuggestions: Story = {
  args: { path: "/app/demo-example/rounds", routePath: "/app/$workspaceSlug/rounds", title: "" },
  play: async ({ canvasElement }) => {
    const body = within(await panel(canvasElement));
    await expect(body.queryByRole("button", { name: /What changed/ })).toBeNull();
    await expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveFocus();
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
    await expect(body.queryByText(/outstanding/)).toBeNull();
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
    const body = within(await panel(canvasElement));
    await userEvent.click(await body.findByRole("button", { name: /What changed in version 2/ }));
    await expect(await body.findByText(/Version 2 raises the request/)).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Read 2 submissions and checked 2 review requests" }),
    ).toBeVisible();
    await expect(
      body.getByText(/Jules Patel's review of version 2 is still outstanding/),
    ).toBeVisible();
  },
};

const proposed = async (
  canvasElement: HTMLElement,
  userEvent: Parameters<NonNullable<Story["play"]>>[0]["userEvent"],
) => {
  const body = within(await panel(canvasElement));
  await userEvent.click(
    await body.findByRole("button", { name: /Draft a question to the applicant/ }),
  );
  await expect(await body.findByText("Needs approval")).toBeVisible();
  return body;
};

export const ProposalAwaiting: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await expect(body.getByText("Ask Maya Thompson to confirm the venue")).toBeVisible();
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
    await expect(body.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};

export const ProposalDeclined: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = await proposed(canvasElement, userEvent);
    await userEvent.click(body.getByRole("button", { name: "Decline" }));
    await expect(await body.findByText("Declined. Nothing was changed.")).toBeVisible();
    await expect(body.queryByText("Demo preview: nothing was sent.")).toBeNull();
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

export const Closed: Story = {
  args: { isInitiallyOpen: false },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "Ask Merit AI" })).toBeVisible();
    await expect(body.queryByRole("region", { name: "Merit AI" })).toBeNull();
  },
};
