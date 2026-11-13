import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, userEvent, within } from "storybook/test";

import type { ActivityEntry } from "@merit/grantmaking/api";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { WorkspaceActivity, type ActivityFilters } from "./workspace-activity";

const rounds = [
  { id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
  { id: "h7m2p9x4n6rt", title: "Community grants 2028" },
];
const people = [
  { id: "dana", name: "Dana Reed" },
  { id: "former", name: null },
];

const entry = (index: number, overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`,
  recordedAt: new Date(Date.UTC(2027, 0, 20, 12, 0, 0) - index * 3_600_000).toISOString(),
  actor: "Dana Reed",
  provenance: { interface: "web" },
  action: "application.created",
  subject: {
    type: "application",
    id: "b8q3w5j7c2df",
    revision: 0,
    name: null,
    roundId: null,
    applicationId: "b8q3w5j7c2df",
  },
  record: { kind: "application", id: "b8q3w5j7c2df", title: "Workshop Saturdays" },
  ...overrides,
});

const recent: ActivityEntry[] = [
  entry(1, { action: "recommendation.recorded" }),
  entry(2, {
    action: "assessment.submitted",
    actor: "Sam Morgan",
    record: { kind: "application", id: "0123456789ac", title: "Neighbour Table" },
  }),
  entry(3, {
    action: "round.budget_changed",
    record: { kind: "round", id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
  }),
  entry(4, { action: "application.marked_ready" }),
  entry(5),
];

const olderPage = [6, 7, 8].map((index) =>
  entry(index, {
    action: "round.criteria_changed",
    record: { kind: "round", id: "h7m2p9x4n6rt", title: "Community grants 2028" },
  }),
);

const Preview = ({
  initialFilters,
  more = [],
  ...props
}: Omit<
  ComponentProps<typeof WorkspaceActivity>,
  "filters" | "onFiltersChange" | "onShowMore" | "hasMore"
> & { initialFilters?: ActivityFilters; more?: ActivityEntry[] }) => {
  const [filters, setFilters] = useState<ActivityFilters>(
    initialFilters ?? { roundId: "", personId: "" },
  );
  const [shown, setShown] = useState(0);

  return (
    <WorkspaceActivity
      {...props}
      entries={[...props.entries, ...more.slice(0, shown)]}
      filters={filters}
      onFiltersChange={setFilters}
      hasMore={shown < more.length}
      onShowMore={() => setShown(more.length)}
    />
  );
};

const meta = {
  title: "Features/Activity/Workspace activity",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  component: Preview,
  args: {
    entries: recent,
    people,
    rounds,
    renderRecordLink: (record, label) => (
      <a href={`/app/example/${record.kind === "round" ? "rounds" : "applications"}/${record.id}`}>
        {label}
      </a>
    ),
  },
  decorators: [
    (Story) => (
      <ApplicationPage
        locationKey="activity"
        breadcrumb={null}
        breadcrumbLabel="Breadcrumb"
        width="full"
      >
        <GrantmakingMessagesProvider>
          <Story />
        </GrantmakingMessagesProvider>
      </ApplicationPage>
    ),
  ],
} satisfies Meta<typeof Preview>;

export default meta;

export const Populated: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Dana Reed")).not.toHaveLength(0);
    await expect(canvas.getByText("20/01/2027, 11:00:00 UTC")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Neighbour Table" })).toBeVisible();
    await expect(canvas.getByText("Recommendation saved")).toBeVisible();
  },
};

export const LongText: StoryObj<typeof meta> = {
  args: {
    entries: [
      entry(1, {
        actor: "Alexandria Catherine Montgomery-Featherstonehaugh of the Regional Community Fund",
        record: {
          kind: "application",
          id: "b8q3w5j7c2df",
          title:
            "Intergenerational neighbourhood repair, tool library, and Saturday workshop programme for residents of the eastern districts, including accessible transport",
        },
      }),
      entry(2, {
        provenance: { interface: "mcp", clientId: "a-very-long-client-identifier-from-a-vendor" },
      }),
    ],
  },
};

export const UnknownActor: StoryObj<typeof meta> = {
  args: { entries: [entry(1, { actor: null }), ...recent.slice(1, 3)] },
};

export const McpProvenance: StoryObj<typeof meta> = {
  args: {
    entries: [
      entry(1, { provenance: { interface: "mcp", clientId: "grant-assistant" } }),
      ...recent.slice(1, 3),
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("via MCP client grant-assistant")).toBeVisible();
  },
};

export const MissingTarget: StoryObj<typeof meta> = {
  args: {
    entries: [
      entry(1, { action: "application.deleted", record: null }),
      entry(2, { action: "widget.polished", record: null }),
      ...recent.slice(1, 3),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("No longer available")).toHaveLength(2);
    await expect(canvas.getByText("Changed")).toBeVisible();
  },
};

export const Empty: StoryObj<typeof meta> = {
  args: { entries: [], people: [], rounds: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No activity yet.")).toBeVisible();
  },
};

export const EmptyFilter: StoryObj<typeof meta> = {
  args: { entries: [], initialFilters: { roundId: "h7m2p9x4n6rt", personId: "" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No activity matches these filters.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Clear filters" })).toBeVisible();
  },
};

export const ClearFilters: StoryObj<typeof meta> = {
  args: { ...EmptyFilter.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));
    await expect(canvas.getByText("No activity yet.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  },
};

export const MorePages: StoryObj<typeof meta> = {
  args: { more: olderPage },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Show older activity" }),
    ).toBeVisible();
  },
};

export const ShowOlderActivity: StoryObj<typeof meta> = {
  args: { more: olderPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show older activity" }));
    await expect(canvas.getAllByText("Round criteria changed")).toHaveLength(3);
    await expect(
      canvas.queryByRole("button", { name: "Show older activity" }),
    ).not.toBeInTheDocument();
  },
};

export const Loading: StoryObj<typeof meta> = { args: { status: "refreshing" } };
export const Failed: StoryObj<typeof meta> = { args: { status: "failed", onRetry: () => {} } };
