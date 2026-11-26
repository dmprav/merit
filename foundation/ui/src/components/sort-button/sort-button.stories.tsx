import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { Inline } from "../layout/layout";
import { SortButton } from "./sort-button";

const onSortPress = fn();

const meta = {
  title: "Components/Sort button",
  component: SortButton,
  args: { children: "Requested", onPress: fn() },
} satisfies Meta<typeof SortButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const directions = [undefined, "ascending", "descending"] as const;

const Headings = () => {
  const [index, setIndex] = useState(1);
  return (
    <Inline gap={6}>
      <SortButton onPress={onSortPress}>Applicant</SortButton>
      <SortButton direction={directions[index % 3]} onPress={() => setIndex((value) => value + 1)}>
        Requested
      </SortButton>
      <SortButton align="end" direction="descending" onPress={onSortPress}>
        Amount
      </SortButton>
    </Inline>
  );
};

export const Directions: Story = {
  parameters: { controls: { disable: true } },
  render: () => <Headings />,
  play: async ({ canvas, userEvent }) => {
    const requested = canvas.getByRole("button", { name: "Requested" });
    await userEvent.click(requested);
    await expect(requested).toHaveAttribute("data-direction", "descending");
  },
};
