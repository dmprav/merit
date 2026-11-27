import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Inline } from "../../components/layout/layout";
import { VisuallyHidden } from "../../components/visually-hidden/visually-hidden";
import { CalendarDate } from "../timestamp/timestamp";
import { MetaItem } from "./meta-item";

const meta = {
  title: "Patterns/Meta item",
  component: MetaItem,
  tags: ["!autodocs"],
  args: { icon: "calendar", children: "Due 14 Feb 2027" },
} satisfies Meta<typeof MetaItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Due 14 Feb 2027")).toBeVisible();
  },
};

export const Dates: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <MessagesProvider messages={{}}>
      <Inline gap={4}>
        <MetaItem icon="calendar">
          <VisuallyHidden>Response requested by </VisuallyHidden>
          <CalendarDate value="2027-02-14" />
        </MetaItem>
        <MetaItem icon="clock">Updated 3 days ago</MetaItem>
      </Inline>
    </MessagesProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("time")).toHaveAttribute("datetime", "2027-02-14");
  },
};
