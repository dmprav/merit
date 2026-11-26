import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Attribution } from "../attribution/attribution";
import { Timeline, TimelineEntry } from "./timeline";

const meta = {
  title: "Patterns/Timeline",
  component: Timeline,
  subcomponents: { TimelineEntry },
  args: { children: null },
  argTypes: { children: { control: false } },
  parameters: { controls: { disable: true } },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Story />
      </MessagesProvider>
    ),
  ],
} satisfies Meta<typeof Timeline>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RecordedEvents: Story = {
  render: () => (
    <Timeline label="Application history">
      <TimelineEntry
        title="Revised submission recorded"
        attribution={
          <Attribution
            actor="Dana Reed"
            provenance={{ interface: "web" }}
            recordedAt="2027-01-17T11:00:00Z"
          />
        }
      >
        <p>The applicant clarified booking and access arrangements.</p>
      </TimelineEntry>
      <TimelineEntry
        title="Application recorded"
        attribution={
          <Attribution actor={null} provenance={null} recordedAt="2027-01-08T09:30:00Z" />
        }
      />
    </Timeline>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("list", { name: "Application history" }).children).toHaveLength(
      2,
    );
    await expect(canvas.getByText("Recorded by Name not recorded")).toBeVisible();
  },
};
