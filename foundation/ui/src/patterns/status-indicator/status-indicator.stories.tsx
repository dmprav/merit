import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { StatusIndicator } from "./status-indicator";

const meta = {
  title: "Patterns/Status indicator",
  component: StatusIndicator,
  tags: ["!autodocs"],
  args: {
    label: "Earlier recommendation",
    explanation: "This recommendation was prepared for an earlier application version.",
    closeLabel: "Close explanation",
  },
} satisfies Meta<typeof StatusIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Muted: Story = { args: { tone: "muted" } };
export const Keyboard: Story = {
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    await userEvent.tab();
    const trigger = canvas.getByRole("button", { name: args.label });
    trigger.focus();
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent(args.explanation);
  },
};
export const Explanation: Story = {
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: args.label });
    await userEvent.click(trigger);
    await expect(await body.findByRole("dialog", { name: args.label })).toHaveTextContent(
      args.explanation,
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
  },
};
