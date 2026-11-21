import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Button } from "../button/button";
import { Inline, Reading, Stack } from "../layout/layout";
import { Link } from "../link/link";
import { Notice } from "./notice";

const meta = {
  title: "Components/Notice",
  component: Notice,
  args: {
    tone: "warning",
    children: "Confirm the revised budget before making a recommendation.",
  },
  argTypes: { tone: { control: "select", options: ["neutral", "success", "warning", "danger"] } },
} satisfies Meta<typeof Notice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Reading prose={false}>
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
    title: "A newer version has been saved",
    children: "Your draft is still here. Compare it with the saved version before continuing.",
    actions: (
      <Inline>
        <Button size="medium" variant="secondary" onPress={fn()}>
          Use saved version
        </Button>
        <Button size="medium" variant="secondary" onPress={fn()}>
          Keep my draft
        </Button>
      </Inline>
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
        <Link href="/docs/team">team guide</Link> for invitation options.
      </>
    ),
  },
};

export const InlineFailure: Story = {
  args: {
    appearance: "inline",
    tone: "danger",
    role: "alert",
    children: "The invitation couldn’t be saved. Your entries are preserved; try again.",
  },
};
