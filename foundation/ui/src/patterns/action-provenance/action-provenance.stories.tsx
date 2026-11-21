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
    await expect(canvas.getByText("via MCP client grant-review-assistant")).toBeVisible();
    await expect(canvas.queryByText("via Merit web")).toBeNull();
    await expect(canvas.queryByText("Interface not recorded")).toBeNull();
  },
};

/** A record's own details name every interface, including web and unrecorded ones. */
export const RecordDetail: Story = {
  render: () => (
    <Stack>
      <ActionProvenance value={{ interface: "web" }} detail />
      <ActionProvenance value={{ interface: "mcp", clientId: "grant-review-assistant" }} detail />
      <ActionProvenance value={null} detail />
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
