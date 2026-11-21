import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Button } from "../button/button";
import { Text } from "../text/text";
import { Inline, Reading, Stack } from "./layout";
import styles from "./layout.stories.module.css";

const meta = {
  title: "Components/Layout primitives",
  tags: ["!autodocs"],
  component: Stack,
  subcomponents: { Inline, Reading },
  args: { gap: 4 },
  render: (args) => (
    <div className={styles.preview}>
      <Stack {...args} as="section" aria-labelledby="layout-title">
        <h2 id="layout-title" className={styles.heading}>
          Prepare the recommendation
        </h2>
        <Reading as="p">
          Read the current submission and compare the assessments before recording a recommendation.
          Keep the evidence and its source available while you write.
        </Reading>
        <div className={styles.steps}>
          <Stack as="ol" gap={2} aria-label="Preparation steps">
            <li>Read the revised submission.</li>
            <li>Compare the reviewer assessments.</li>
            <li>Record the recommendation and its reasons.</li>
          </Stack>
        </div>
        <Inline role="group" aria-label="Recommendation actions">
          <Button size="medium" variant="secondary">
            Read the revised submission
          </Button>
          <Button size="medium" variant="secondary">
            Compare reviewer assessments
          </Button>
        </Inline>
      </Stack>
    </div>
  ),
} satisfies Meta<typeof Stack>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Flow: Story = {};

export const Divided: Story = {
  args: { gap: 6, divided: "between" },
  play: async ({ canvas }) => {
    const section = canvas.getByRole("region", { name: "Prepare the recommendation" });
    const actions = canvas.getByRole("group", { name: "Recommendation actions" });
    await expect(getComputedStyle(actions).paddingTop).toBe(getComputedStyle(section).rowGap);
    await expect(getComputedStyle(actions).gap).not.toBe(getComputedStyle(section).rowGap);
  },
};

export const ReadingWidth: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={5}>
      <Reading as="p">
        Read the current submission alongside its supporting evidence before preparing a
        recommendation. Keep the applicant’s account distinct from reviewer judgments, with source
        material available for inspection. The prose keeps a readable line length while the actions
        below can use the width of their container.
      </Reading>
      <Inline justify="between">
        <Button size="medium" variant="secondary">
          Read submission
        </Button>
        <Button size="medium">Prepare recommendation</Button>
      </Inline>
    </Stack>
  ),
};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, userEvent }) => {
    const steps = canvas.getByRole("list", { name: "Preparation steps" });
    await expect(steps.children).toHaveLength(3);

    const read = canvas.getByRole("button", { name: "Read the revised submission" });
    const compare = canvas.getByRole("button", { name: "Compare reviewer assessments" });
    await expect(compare.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      read.getBoundingClientRect().bottom,
    );
    const region = canvas.getByRole("region", { name: "Prepare the recommendation" });
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);

    await userEvent.click(read);
    await expect(read).toHaveFocus();
    await userEvent.tab();
    await expect(compare).toHaveFocus();
  },
};

export const Alignment: Story = {
  render: (args) => (
    <div className={styles.preview}>
      <Stack {...args} gap={6}>
        <Inline
          gap={3}
          align="start"
          justify="between"
          role="group"
          aria-label="Submission context"
        >
          <div className={styles.context}>
            <Stack gap={1}>
              <h2 className={styles.heading}>Source materials</h2>
              <p>
                Read the current submission and its supporting evidence before making a
                recommendation.
              </p>
            </Stack>
          </div>
          <Button size="medium" variant="secondary">
            Read submission
          </Button>
        </Inline>
        <Inline align="baseline">
          <span className={styles.heading}>£42,000</span>
          <Text as="span" variant="caption">
            requested in this submission
          </Text>
        </Inline>
        <Inline gap={3} justify="end" role="group" aria-label="Recommendation actions">
          <Button size="medium" variant="secondary">
            Close
          </Button>
          <Button size="medium">Save recommendation</Button>
        </Inline>
      </Stack>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const actions = canvas.getByRole("group", { name: "Recommendation actions" });
    const close = canvas.getByRole("button", { name: "Close" });
    const save = canvas.getByRole("button", { name: "Save recommendation" });
    await expect(save.getBoundingClientRect().right).toBeCloseTo(
      actions.getBoundingClientRect().right,
      0,
    );

    close.focus();
    await userEvent.tab();
    await expect(save).toHaveFocus();
  },
};

export const NarrowAlignment: Story = {
  ...Alignment,
  decorators: Narrow.decorators,
  play: async (context) => {
    const { canvas, userEvent } = context;
    const group = canvas.getByRole("group", { name: "Submission context" });
    const evidence = canvas.getByText(
      "Read the current submission and its supporting evidence before making a recommendation.",
    );
    const read = canvas.getByRole("button", { name: "Read submission" });
    await expect(read.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      evidence.getBoundingClientRect().bottom,
    );
    await expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
    await expect(read.getBoundingClientRect().left).toBeCloseTo(
      group.getBoundingClientRect().left,
      0,
    );

    read.focus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Close" })).toHaveFocus();
    await Alignment.play?.(context);
  },
};

export const DividedEntries: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className={styles.preview}>
      <Stack as="ol" gap={3} divided="between" aria-label="Contact history">
        <li>Email changed by Dana Reed</li>
        <li>Affiliation added by Sam Morgan</li>
        <li>Contact recorded by Dana Reed</li>
      </Stack>
    </div>
  ),
};
