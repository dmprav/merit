import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Stack } from "../../components/layout/layout";
import { Attribution } from "./attribution";

const meta = {
  title: "Patterns/Attribution",
  component: Attribution,
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Story />
      </MessagesProvider>
    ),
  ],
  args: {
    actor: "Dana Reed",
    provenance: { interface: "mcp", clientId: "grant-review-assistant" },
    recordedAt: "2027-01-17T11:00:00Z",
  },
  argTypes: {
    provenance: { control: false },
  },
} satisfies Meta<typeof Attribution>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <Attribution
        actor="Dana Reed"
        provenance={{ interface: "web" }}
        recordedAt="2027-01-17T11:00:00Z"
      />
      <Attribution
        actor="Sam Okafor"
        provenance={{ interface: "mcp", clientId: "grant-review-assistant" }}
        recordedAt="2027-01-12T15:45:00Z"
      />
      <Attribution actor={null} provenance={null} recordedAt="2027-01-08T09:30:00Z" />
      <Attribution actor="Priya Shah" />
      <Attribution actor="Dana Reed" action="ran" provenance={{ interface: "web" }} />
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Recorded by Dana Reed")).toBeVisible();
    await expect(canvas.getByText("via MCP client grant-review-assistant")).toBeVisible();
    await expect(canvas.getByText("Recorded by Name not recorded")).toBeVisible();
    await expect(canvas.getByText("Run by Dana Reed")).toBeVisible();
  },
};

export const Playground: Story = {};
