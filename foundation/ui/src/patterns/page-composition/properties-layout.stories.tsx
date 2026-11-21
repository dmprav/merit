import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/description-list/description-list";
import { Reading } from "../../components/layout/layout";
import { PropertiesLayout } from "./properties-layout";

const meta = {
  title: "Patterns/Page composition/Properties layout",
  component: PropertiesLayout,
  args: {
    propertiesLabel: "Round properties",
    children: (
      <Reading as="p">
        Support local projects that bring neighbours together and make community spaces more
        accessible.
      </Reading>
    ),
    properties: (
      <DescriptionList layout="rows">
        <DescriptionListItem label="Budget">£120,000</DescriptionListItem>
        <DescriptionListItem label="Committee">14 March 2027</DescriptionListItem>
      </DescriptionList>
    ),
  },
} satisfies Meta<typeof PropertiesLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PropertiesFirstWhenStacked: Story = {
  play: async ({ canvas }) => {
    const panel = canvas.getByRole("complementary", { name: "Round properties" });
    await expect(panel.nextElementSibling).toHaveTextContent("Support local projects");
  },
};
export const PropertiesLastWhenStacked: Story = {
  args: { stackedPlacement: "after" },
  play: async ({ canvas }) => {
    const panel = canvas.getByRole("complementary", { name: "Round properties" });
    await expect(panel.previousElementSibling).toHaveTextContent("Support local projects");
  },
};
