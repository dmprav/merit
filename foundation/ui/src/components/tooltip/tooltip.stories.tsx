import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { Inline } from "../layout/layout";
import { Tooltip } from "./tooltip";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["!autodocs"],
  args: {
    content: "Copy address",
    children: (
      <Button variant="quiet" iconOnly aria-label="Copy address">
        <Icon name="copy" />
      </Button>
    ),
  },
  argTypes: { children: { control: false } },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Keyboard: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.tab();
    canvas.getByRole("button").focus();

    await expect(await page.findByRole("tooltip")).toHaveTextContent("Copy address");
    await expect(canvas.getByRole("button")).toHaveAccessibleDescription("Copy address");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).not.toBeInTheDocument());
    await expect(canvas.getByRole("button")).toHaveFocus();

    // Leave the keyboard state open for visual inspection.
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await expect(await page.findByRole("tooltip")).toBeVisible();
  },
};

export const Hover: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Establish pointer modality after a preceding keyboard story.
    await userEvent.click(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("button"));

    const page = within(canvasElement.ownerDocument.body);
    const tooltip = await page.findByRole("tooltip");
    await expect(tooltip).toBeVisible();

    await userEvent.unhover(canvas.getByRole("button"));
    await userEvent.hover(tooltip);
    await expect(tooltip).toBeVisible();
    await userEvent.unhover(tooltip);
    await waitFor(() => expect(page.queryByRole("tooltip")).not.toBeInTheDocument());

    await userEvent.hover(canvas.getByRole("button"));
    await expect(await page.findByRole("tooltip")).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    content:
      "Resume editing the position, proposed allocation, and reasoning for this recommendation.",
    children: (
      <Button variant="quiet" iconOnly aria-label="Resume recommendation">
        <Icon name="edit" />
      </Button>
    ),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.tab();
    canvas.getByRole("button").focus();
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toBeVisible();
  },
};

export const Placements: Story = {
  render: (args) => (
    <Inline gap={4}>
      {(["top", "bottom", "left", "right"] as const).map((placement) => (
        <Tooltip key={placement} {...args} content="Copy address" placement={placement}>
          <Button variant="secondary">{placement}</Button>
        </Tooltip>
      ))}
    </Inline>
  ),
};
