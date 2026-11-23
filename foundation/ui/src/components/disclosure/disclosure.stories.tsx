import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect } from "storybook/test";

import { Disclosure } from "./disclosure";

const meta = {
  title: "Components/Disclosure",
  component: Disclosure,
  args: {
    title: "Earlier versions",
    count: 2,
    children: <p>Version 1 recommended funding at €18,000 before the venue changed.</p>,
  },
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Earlier versions 2" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(/Version 1 recommended funding/)).toBeVisible();
  },
};

export const Expanded: Story = { args: { defaultExpanded: true } };

const ControlledExample = (args: ComponentProps<typeof Disclosure>) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <>
      <Disclosure {...args} isExpanded={expanded} onExpandedChange={setExpanded} />
      <button type="button" onClick={() => setExpanded(false)}>
        Fold
      </button>
    </>
  );
};

/** The caller owns the open state, so it can fold the content when its work is done. */
export const Controlled: Story = {
  render: (args) => <ControlledExample {...args} />,
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Earlier versions 2" });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Fold" }));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  },
};
