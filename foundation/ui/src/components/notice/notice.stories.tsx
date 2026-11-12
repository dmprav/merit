import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Button } from "../button/button";
import { Inline, Reading, Stack } from "../layout/layout";
import linkStyles from "../link/link.module.css";
import { Notice } from "./notice";

const meta = {
  title: "Components/Notice",
  component: Notice,
  args: { children: "Confirm the revised budget before making a recommendation." },
  argTypes: { tone: { control: "select", options: ["neutral", "success", "warning", "danger"] } },
  parameters: {
    docs: {
      description: {
        component:
          'Notice provides persistent feedback beside the work it concerns. Choose neutral for information, success for a completed action, warning for something needing attention, and danger for a failure. Warning is the default. State the meaning and next step in text; color is supplementary. Keep short messages to one sentence. Use as="div" for paragraphs and recovery actions, or as="ul" for a list. Notice spaces direct blocks; use Inline for a wrapping action group. Tone controls appearance only: callers choose role and aria-live when an update needs announcing. Use StatusMessage for transient confirmations.',
      },
    },
  },
} satisfies Meta<typeof Notice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Reading>
      <Stack gap={3}>
        <Notice tone="neutral">Only workspace members can view this application.</Notice>
        <Notice tone="success">The invitation was sent. It expires in seven days.</Notice>
        <Notice tone="warning">Confirm the revised budget before making a recommendation.</Notice>
        <Notice tone="danger">
          The recommendation could not be saved. Your draft is retained.
        </Notice>
      </Stack>
    </Reading>
  ),
};

export const WithRecovery: Story = {
  args: {
    as: "div",
    tone: "warning",
    children: (
      <>
        <p>
          <strong>A newer version has been saved</strong>
        </p>
        <p>Your draft is still here. Compare it with the saved version before continuing.</p>
        <Inline>
          <Button variant="secondary" onPress={fn()}>
            Use saved version
          </Button>
          <Button variant="secondary" onPress={fn()}>
            Keep my draft
          </Button>
        </Inline>
      </>
    ),
  },
};

export const List: Story = {
  args: {
    as: "ul",
    tone: "warning",
    "aria-label": "Before making a recommendation",
    children: (
      <>
        <li>Confirm the revised budget with the applicant.</li>
        <li>Resolve the open eligibility question before making a recommendation.</li>
      </>
    ),
  },
};

export const LongContent: Story = {
  args: {
    tone: "neutral",
    children: (
      <>
        Delivery is not confirmed for community.partnerships.and.grants@alder-foundation.example.
        You can copy the invitation link and share it directly. See the{" "}
        <a className={linkStyles.text} href="/docs/team">
          team guide
        </a>{" "}
        for invitation options.
      </>
    ),
  },
};
