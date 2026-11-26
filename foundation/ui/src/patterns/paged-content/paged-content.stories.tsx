import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Attribution } from "../attribution/attribution";
import { Timeline, TimelineEntry } from "../timeline/timeline";
import { CollectionRecovery, PagedContent } from "./paged-content";

type HistoryItem = {
  id: string;
  title: string;
  actor: string;
  recordedAt: string;
};

const sampleEntries: HistoryItem[] = [
  {
    id: "e1",
    title: "Revised submission recorded",
    actor: "Dana Reed",
    recordedAt: "2027-01-17T11:00:00Z",
  },
  {
    id: "e2",
    title: "Application recorded",
    actor: "Sam Patel",
    recordedAt: "2027-01-08T09:30:00Z",
  },
];

const renderTimeline = (entries: HistoryItem[]) => (
  <Timeline label="Application history">
    {entries.map((entry) => (
      <TimelineEntry
        key={entry.id}
        title={entry.title}
        attribution={<Attribution actor={entry.actor} recordedAt={entry.recordedAt} />}
      />
    ))}
  </Timeline>
);

const onMore = fn();
const onRetry = fn();

const meta = {
  title: "Patterns/Paged content",
  component: PagedContent<HistoryItem>,
  subcomponents: { CollectionRecovery },
  parameters: { controls: { disable: true } },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Story />
      </MessagesProvider>
    ),
  ],
  args: {
    entries: sampleEntries,
    children: renderTimeline,
    more: onMore,
    retry: onRetry,
  },
  beforeEach: () => {
    onMore.mockReset();
    onRetry.mockReset();
  },
} satisfies Meta<typeof PagedContent<HistoryItem>>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A loaded page with older entries remaining. */
export const WithMore: Story = {
  args: { hasMore: true },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Revised submission recorded")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load older entries" }));
    await expect(onMore).toHaveBeenCalledOnce();
  },
};

/**
 * When a later page fails while earlier entries stay on screen, `CollectionRecovery` offers retry
 * in a toast and leaves a quiet retry button if the toast is dismissed.
 */
export const PageFailureRecovery: Story = {
  args: {
    entries: sampleEntries.slice(0, 1),
    failed: true,
    hasMore: true,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText("Revised submission recorded")).toBeVisible();
    const page = within(canvasElement.ownerDocument.body);
    const toast = await page.findByRole("alertdialog", { name: "History could not be loaded." });
    await waitFor(() =>
      expect(within(toast).getByRole("button", { name: "Try again" })).toBeVisible(),
    );

    await userEvent.click(within(toast).getByRole("button", { name: "Close" }));
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
  },
};

export const FirstPageLoading: Story = {
  args: { entries: [], loaded: false, pending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading history…");
  },
};

export const FirstPageFailed: Story = {
  args: { entries: [], loaded: false, failed: true },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("History could not be loaded.");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(onRetry).toHaveBeenCalledOnce();
  },
};

export const AccessWithdrawn: Story = {
  args: { denied: true, hasMore: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("This history is no longer available.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Load older entries" })).toBeNull();
  },
};
