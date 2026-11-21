import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect } from "storybook/test";

import { Inline } from "../layout/layout";
import { SortButton } from "./sort-button";

const meta = {
  title: "Components/Sort button",
  component: SortButton,
  args: { children: "Requested", onPress: () => {} },
  parameters: {
    docs: {
      description: {
        component:
          "SortButton orders a collection from its column heading. The data table uses it for sortable columns and sets aria-sort on the header cell. It keeps the heading's typography, shows the current direction, and reveals a cue on hover and keyboard focus for unsorted columns.",
      },
    },
  },
} satisfies Meta<typeof SortButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const directions = [undefined, "ascending", "descending"] as const;

const Headings = () => {
  const [index, setIndex] = useState(1);
  return (
    <Inline gap={6}>
      <SortButton onPress={() => {}}>Applicant</SortButton>
      <SortButton direction={directions[index % 3]} onPress={() => setIndex((value) => value + 1)}>
        Requested
      </SortButton>
      <SortButton align="end" direction="descending" onPress={() => {}}>
        Amount
      </SortButton>
    </Inline>
  );
};

export const Directions: Story = {
  render: () => <Headings />,
  play: async ({ canvas, userEvent }) => {
    const requested = canvas.getByRole("button", { name: "Requested" });
    await userEvent.click(requested);
    await expect(requested).toHaveAttribute("data-direction", "descending");
  },
};
