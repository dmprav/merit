import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";

import type { ActivityEntry } from "@merit/grantmaking/api";
import { formatTimestamp } from "@merit/i18n/format";
import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

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

const workshop = { kind: "application", id: "b8q3w5j7c2df", title: "Workshop Saturdays" } as const;
const neighbour = { kind: "application", id: "0123456789ac", title: "Neighbour Table" } as const;
const canal = { kind: "application", id: "c8q3w5j7c2df", title: "Canal Garden" } as const;
const repairs = { kind: "application", id: "d8q3w5j7c2df", title: "Repair Together" } as const;
const localRound = { kind: "round", id: "k7m2p9x4n6rt", title: "Local Connections 2027" } as const;

const entry = (index: number, overrides: Partial<ActivityEntry> = {}): ActivityEntry => {
  const record = overrides.record ?? workshop;
  return {
    id: `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`,
    recordedAt: new Date(Date.UTC(2027, 0, 20, 12, 0, 0) - index * 3_600_000).toISOString(),
    actor: "Dana Reed",
    provenance: { interface: "web" },
    action: "application.created",
    subject: {
      type: overrides.action?.split(".")[0] ?? record.kind,
      id: record.id,
      revision: 0,
      name: record.title,
      roundId: localRound.id,
      applicationId: record.kind === "application" ? record.id : null,
    },
    reason: null,
    record,
    ...overrides,
  };
};

const recent: ActivityEntry[] = [
  entry(1, { action: "recommendation.recorded" }),
  entry(2, { action: "assessment.submitted", actor: "Sam Morgan", record: neighbour }),
  entry(3, {
    action: "application.withdraw",
    record: canal,
    reason:
      "The residents secured funding through the parks partnership and no longer need this grant.",
  }),
  entry(4, { action: "round.budget_changed", record: localRound }),
  entry(5, { action: "application.marked_ready", record: repairs }),
  entry(6, {
    action: "application.summary_changed",
    provenance: { interface: "mcp", clientId: "grant-assistant" },
    record: repairs,
  }),
];

const earlier: ActivityEntry[] = [
  entry(7, { action: "assessment.recorded", actor: "Sam Morgan" }),
  entry(8, { action: "review_assignment.accepted", actor: "Sam Morgan", record: neighbour }),
  entry(9, { action: "review_assignment.invited", record: neighbour }),
  entry(10, { action: "review_request.created", record: neighbour }),
  entry(11, { action: "application.marked_ready", record: neighbour }),
  entry(12, { action: "application.contact_changed", record: canal }),
  entry(13, { action: "application.marked_ready" }),
  entry(14, { action: "application.material_changed", record: repairs }),
  entry(15, { action: "application.summary_changed", record: neighbour }),
  entry(16, { action: "application.material_changed" }),
  entry(17, { action: "round.manager_changed", record: localRound }),
  entry(18, { record: repairs }),
];

const olderPage: ActivityEntry[] = [
  entry(19, { record: canal }),
  entry(20, { record: neighbour }),
  entry(21),
  entry(22, { action: "round.criteria_changed", record: localRound }),
  entry(23, { action: "round.created", record: localRound }),
];

const Preview = ({
  initialFilters,
  more = [],
  status: initialStatus,
  onRetry,
  ...props
}: Omit<
  ComponentProps<typeof WorkspaceActivity>,
  "filters" | "onFiltersChange" | "onShowMore" | "hasMore"
> & { initialFilters?: ActivityFilters; more?: ActivityEntry[] }) => {
  const [filters, setFilters] = useState<ActivityFilters>(
    initialFilters ?? { roundId: "", personId: "" },
  );
  const [shown, setShown] = useState(0);
  const [recovered, setRecovered] = useState(false);

  const selectedPerson = props.people.find((person) => person.id === filters.personId);
  const allEntries = [...props.entries, ...more.slice(0, shown)];
  const filteredEntries = allEntries.filter(
    (item) =>
      (!filters.roundId || item.subject.roundId === filters.roundId) &&
      (!filters.personId || item.actor === (selectedPerson?.name ?? null)),
  );
  const status = recovered ? "ready" : initialStatus;

  return (
    <WorkspaceActivity
      {...props}
      status={status}
      onRetry={
        onRetry
          ? () => {
              setRecovered(true);
              onRetry();
            }
          : undefined
      }
      entries={filteredEntries}
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
  parameters: { layout: "fullscreen", controls: { disable: true } },
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
      <ApplicationStage>
        <ApplicationPage
          locationKey="activity"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
          width="full"
        >
          <GrantmakingMessagesProvider>
            <PageHeader title="Activity" />
            <Story />
          </GrantmakingMessagesProvider>
        </ApplicationPage>
      </ApplicationStage>
    ),
  ],
} satisfies Meta<typeof Preview>;

export default meta;

export const Populated: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Recorded by Dana Reed")).not.toHaveLength(0);
    await expect(
      canvas.getByText(formatTimestamp("2027-01-20T11:00:00.000Z", "en-GB")),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Neighbour Table" })).toBeVisible();
    await expect(canvas.getByText("Recommendation saved")).toBeVisible();
  },
};

export const LongText: StoryObj<typeof meta> = {
  args: {
    entries: [
      entry(1, {
        actor: "Alexandria Catherine Montgomery-Featherstonehaugh of the Regional Community Fund",
        action: "application.withdraw",
        reason:
          "The applicant is revising the partnership and transport arrangements with the neighbourhood associations. They will return once residents and the new project coordinator have reviewed the proposed timetable together.",
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
    await userEvent.click(
      within(canvasElement).getAllByRole("button", { name: /view event details/ })[0]!,
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole("dialog")).toHaveTextContent("via MCP client grant-assistant");
  },
};

export const MissingTarget: StoryObj<typeof meta> = {
  args: {
    entries: [
      entry(1, {
        action: "application.deleted",
        record: null,
        subject: { ...entry(1).subject, name: null },
      }),
      entry(2, {
        action: "widget.polished",
        record: null,
        subject: { ...entry(2).subject, name: null },
      }),
      ...recent.slice(2, 4),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("No longer available", { selector: "span" })).toHaveLength(2);
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
    await expect(canvas.getByRole("button", { name: /Remove round filter/ })).toBeVisible();
  },
};

export const ClearFilters: StoryObj<typeof meta> = {
  args: { ...EmptyFilter.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "Clear filters" }));
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByText("No activity yet.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  },
};

export const MorePages: StoryObj<typeof meta> = {
  args: { entries: [...recent, ...earlier], more: olderPage },
};

export const ShowOlderActivity: StoryObj<typeof meta> = {
  args: MorePages.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.queryByRole("button", { name: "Show older activity" })?.scrollIntoView();
    await waitFor(() => expect(canvas.getAllByText("Round criteria changed")).toHaveLength(1));
    await expect(
      canvas.queryByRole("button", { name: "Show older activity" }),
    ).not.toBeInTheDocument();
  },
};

export const Refreshing: StoryObj<typeof meta> = { args: { status: "refreshing" } };
export const Failed: StoryObj<typeof meta> = { args: { status: "failed", onRetry: fn() } };

export const InitialLoading: StoryObj<typeof meta> = {
  args: { entries: [], status: "refreshing" },
};

export const EventDetails: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /Application withdrawn:/ }),
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole("dialog", { name: "Application withdrawn" })).toHaveTextContent(
      "The residents secured funding through the parks partnership",
    );
  },
};
