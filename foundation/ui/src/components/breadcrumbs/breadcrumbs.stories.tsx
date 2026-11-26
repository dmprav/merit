import type { Meta, StoryObj } from "@storybook/react-vite";

import { Breadcrumbs } from "./breadcrumbs";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
  argTypes: { items: { control: false } },
  args: {
    label: "Breadcrumb",
    items: [
      <a key="rounds" href="#rounds">
        Rounds
      </a>,
      <a key="round" href="#applications">
        Local Connections 2027
      </a>,
      "Workshop Saturdays",
    ],
  },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CurrentPageOnly: Story = {
  args: { items: ["Organizations"] },
};

export const Focused: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const link = canvas.getByRole("link", { name: "Rounds" });
    link.focus();
  },
};

export const LongLabels: Story = {
  args: {
    items: [
      <a key="rounds" href="#rounds">
        Rounds
      </a>,
      <a key="round" href="#applications">
        Local Connections 2027: Neighbourhood partnerships and community spaces
      </a>,
      "Workshop Saturdays: A shared space for making, learning, and meeting neighbours",
    ],
  },
};
