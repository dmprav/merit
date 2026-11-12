import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Breadcrumbs } from "./breadcrumbs";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
  parameters: {
    docs: {
      description: {
        component:
          "Show meaningful parent destinations in hierarchy order, followed by the current page as plain text. Supply a translated navigation label and native or router links; features own destinations and preserved route context. Breadcrumbs owns the navigation landmark, ordered list, decorative separators, current-page semantics, and focus styling. Compact text and a medium-weight current page keep the trail quiet but readable. Parent links use the same neutral hover and tinted, underlined keyboard focus as Tabs, with larger touch targets. ApplicationPage positions the component in its top bar. Long labels wrap and stay readable. Keep tabs and editing states outside the trail. An empty trail renders nothing.",
      },
    },
  },
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

    await expect(link).toHaveFocus();
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
