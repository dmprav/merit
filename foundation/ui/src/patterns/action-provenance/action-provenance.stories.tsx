import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Stack } from "../../components/layout/layout";
import { ActionProvenance } from "./action-provenance";

const meta = {
  title: "Patterns/Action provenance",
  component: ActionProvenance,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Identify the interface that recorded an action beside its actor and time. An MCP client identifier describes provenance; it does not establish individual human review. Keep unknown provenance explicit.",
      },
    },
  },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Story />
      </MessagesProvider>
    ),
  ],
} satisfies Meta<typeof ActionProvenance>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sources: Story = {
  render: () => (
    <Stack>
      <ActionProvenance value={{ interface: "web" }} />
      <ActionProvenance value={{ interface: "mcp", clientId: "grant-review-assistant" }} />
      <ActionProvenance value={null} />
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("via Merit web")).toBeVisible();
    await expect(canvas.getByText("via MCP client grant-review-assistant")).toBeVisible();
    await expect(canvas.getByText("Interface not recorded")).toBeVisible();
  },
};

export const LongClientIdentifier: Story = {
  args: { value: { interface: "mcp", clientId: "community-partnerships-grant-review-assistant" } },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "240px" }}>
        <Story />
      </div>
    ),
  ],
};
