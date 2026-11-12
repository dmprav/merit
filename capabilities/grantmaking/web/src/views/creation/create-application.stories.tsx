import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { ComposerPreview } from "../../testing/creation-preview";

const meta = {
  title: "Features/Applications/Create",
  tags: ["!autodocs"],
  component: ComposerPreview,
  parameters: { layout: "fullscreen" },
  args: { application: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add application" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Add application" }),
      ).toBeVisible(),
    );
  },
} satisfies Meta<typeof ComposerPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongRoundName: Story = {
  args: {
    roundTitle:
      "Community partnerships for accessible neighbourhood spaces and year-round activities",
  },
};
