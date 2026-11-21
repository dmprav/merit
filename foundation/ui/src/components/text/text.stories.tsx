import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Stack } from "../layout/layout";
import { Text } from "./text";

const meta = {
  title: "Components/Text",
  component: Text,
  args: { variant: "supporting", children: "Neighbourhood Kitchen" },
  argTypes: {
    variant: {
      control: "select",
      options: ["supporting", "caption", "missing", "emphasis", "attention"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Text gives a run of copy one of five roles; everything else inherits. Headings, labels, attribution, and status belong to SectionHeader, DescriptionList, Attribution, and Notice.",
      },
    },
  },
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Roles: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <div>
        <p>Neighbour Table</p>
        <Text as="p" variant="supporting">
          Neighbourhood Kitchen
        </Text>
      </div>
      <Text as="p" variant="caption">
        Identify the material and criteria actually reviewed, or leave them unknown.
      </Text>
      <p>
        Project dates: <Text variant="missing">Not known</Text>
      </p>
      <p>
        Available before this recommendation: <Text variant="emphasis">€32,000</Text>
      </p>
      <p>
        Over budget if approved: <Text variant="attention">€4,000</Text>
      </p>
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not known")).toBeVisible();
  },
};

export const Playground: Story = {};
