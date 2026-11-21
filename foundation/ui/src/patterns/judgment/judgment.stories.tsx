import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import { Stack } from "../../components/layout/layout";
import { Text } from "../../components/text/text";
import { Judgment, JudgmentChoice } from "./judgment";

const meta = {
  title: "Patterns/Judgment",
  component: Judgment,
  args: {
    author: "Dana Reed",
    meta: "9 November",
    summary: (
      <>
        <strong>Fund</strong>
        <span>€22,000 proposed</span>
      </>
    ),
    basis: <span>Based on an earlier submission (version 2)</span>,
  },
  parameters: {
    docs: {
      description: {
        component:
          "Judgment presents a person's position, such as a recommendation or assessment: who made it and when, the position and any amount, and its basis only when that qualifies the position, such as an earlier submission. Supporting content, such as reasoning, follows. JudgmentChoice presents the same summary as a control that opens the full judgment. The author remains visible before any judgment exists.",
      },
    },
  },
} satisfies Meta<typeof Judgment>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Recorded: Story = {
  render: (args) => (
    <Judgment
      {...args}
      action={
        <Button variant="quiet" iconOnly aria-label="Edit recommendation">
          <Icon name="edit" />
        </Button>
      }
    >
      <p>
        The revised venue keeps every workshop accessible and the budget remains within the round.
      </p>
    </Judgment>
  ),
};

export const NotYetRecorded: Story = {
  render: () => (
    <Stack gap={1}>
      <Judgment author="Dana Reed" />
      <Text as="p" variant="missing">
        No recommendation recorded
      </Text>
    </Stack>
  ),
};

export const Choices: Story = {
  render: () => (
    <Stack gap={3}>
      <JudgmentChoice
        author="Sam Okafor"
        summary={
          <>
            <strong>Fund</strong>
            <span>€20,000 proposed</span>
          </>
        }
        basis={
          <>
            <span>Assessed version 2</span>
            <span>Criteria changed since</span>
          </>
        }
        onPress={fn()}
      />
      <JudgmentChoice
        author="Priya Shah"
        summary={<strong>Outstanding</strong>}
        basis={<span>Requested on version 3</span>}
        onPress={fn()}
      />
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Sam Okafor/ })).toBeVisible();
  },
};
