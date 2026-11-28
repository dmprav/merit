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
  subcomponents: { JudgmentChoice },
  argTypes: {
    summary: { control: false },
    basis: { control: false },
    action: { control: false },
    children: { control: false },
  },
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

const onChooseJudgment = fn();

export const NotYetRecorded: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={1}>
      <Judgment author="Dana Reed" />
      <Text as="p" variant="missing">
        No recommendation recorded
      </Text>
    </Stack>
  ),
};

export const NotAPersonAuthor: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <JudgmentChoice
      author="Merit AI"
      authorIcon="assistant"
      meta="9 November · gpt-5"
      summary={
        <>
          <strong>Fund with a condition</strong>
          <span>Proposed amount: €18,000</span>
        </>
      }
      basis={<span>Reviewed version 2</span>}
      onPress={onChooseJudgment}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Merit AI/ })).toBeVisible();
  },
};

export const Choices: Story = {
  parameters: { controls: { disable: true } },
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
        onPress={onChooseJudgment}
      />
      <JudgmentChoice
        author="Priya Shah"
        summary={<strong>Outstanding</strong>}
        basis={<span>Requested on version 3</span>}
        onPress={onChooseJudgment}
      />
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Sam Okafor/ })).toBeVisible();
  },
};
