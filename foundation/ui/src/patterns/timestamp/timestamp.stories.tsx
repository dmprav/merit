import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { formatTimestamp } from "@merit/i18n/format";

import { Timestamp } from "./timestamp";

const meta = {
  title: "Patterns/Timestamp",
  component: Timestamp,
  args: { value: "2027-01-20T12:00:45Z" },
} satisfies Meta<typeof Timestamp>;

export default meta;

export const Default: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const time = within(canvasElement).getByText(formatTimestamp(args.value, "en-GB"));
    await expect(time).toHaveAttribute("datetime", args.value);
  },
};
