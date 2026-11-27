import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Inline } from "../layout/layout";
import { Toggletip } from "./toggletip";

const meta = {
  title: "Components/Toggletip",
  component: Toggletip,
  tags: ["!autodocs"],
  args: {
    label: "About this request",
    children: "Requested by Dana Reed. Your draft is private until you submit it.",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Toggletip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Warning: Story = {
  args: {
    label: "Earlier version",
    tone: "warning",
    children: "This recommendation was prepared for an earlier application version.",
  },
};

export const Tones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Inline gap={4}>
      <Toggletip label="About this request">Requested by Dana Reed.</Toggletip>
      <Toggletip label="Earlier version" tone="warning">
        Prepared for an earlier application version.
      </Toggletip>
    </Inline>
  ),
};

export const Hover: Story = {
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    // Establish pointer modality after a preceding keyboard story.
    await userEvent.click(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("button"));

    const content = await page.findByRole("group", { name: args.label });
    await waitFor(() => expect(content).toBeVisible());

    await userEvent.unhover(canvas.getByRole("button"));
    await userEvent.hover(content);
    await waitFor(() => expect(content).toBeVisible());
    await userEvent.unhover(content);
    await waitFor(() => expect(page.queryByRole("group")).not.toBeInTheDocument());
  },
};

export const Pinned: Story = {
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: args.label }));
    await userEvent.unhover(canvas.getByRole("button", { name: args.label }));
    await expect(await page.findByRole("group", { name: args.label })).toBeVisible();
  },
};
