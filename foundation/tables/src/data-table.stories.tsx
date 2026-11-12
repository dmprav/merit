import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";

import { Button } from "@merit/ui/button";

import { DataTable, type TableSort, type TableColumn, type TableState } from "./index";

type Item = { id: string; title: string; amount?: number; date?: string };

const items: Item[] = [
  { id: "b", title: "Community transport", amount: 60 },
  { id: "a", title: "Community meals", amount: 24 },
  { id: "c", title: "Weekend workshops" },
];
const columns: TableColumn<Item>[] = [
  {
    id: "title",
    header: "Project",
    cell: (item) => item.title,
    sort: {
      value: (item) => item.title,
      compare: (a, b) => a.title.localeCompare(b.title),
    },
  },
  {
    id: "amount",
    header: "Participants",
    sort: {
      value: (item) => item.amount,
      compare: (a, b) => (a.amount ?? 0) - (b.amount ?? 0),
    },
    cell: (record) => record.amount ?? "—",
    layout: { width: "10rem", align: "end", wrap: false },
  },
];
const longItems: Item[] = [
  {
    id: "a",
    title:
      "Community transport connecting rural neighbourhoods with local services and shared activities",
    amount: 12500,
    date: "9 November 2026",
  },
  {
    id: "b",
    title: "CommunityProjectReferenceWithoutSpacesThatMustRemainReadableAtNarrowWidths0123456789",
    amount: 24,
    date: "12 December 2026",
  },
  { id: "c", title: "Weekend workshops" },
];
const longColumns: TableColumn<Item>[] = [
  columns[0]!,
  {
    id: "date",
    header: "Date",
    layout: { width: "12rem", wrap: false },
    cell: (record) => record.date ?? "—",
  },
  columns[1]!,
];

const Preview = ({
  empty = false,
  longContent = false,
  density = "comfortable",
  state,
  emptyMessage = "No projects yet.",
  navigation = false,
  manyRows = false,
  stickyHeader,
}: {
  empty?: boolean;
  longContent?: boolean;
  density?: "comfortable" | "compact";
  state?: TableState;
  emptyMessage?: string;
  navigation?: boolean;
  manyRows?: boolean;
  stickyHeader?: ComponentProps<typeof DataTable>["stickyHeader"];
}) => {
  const [sorting, setSorting] = useState<TableSort>(null);
  const [inspected, setInspected] = useState<string>();
  const navigationColumns: TableColumn<Item>[] = [
    {
      ...columns[0]!,
      layout: { primary: true },
      cell: (record) => <a href={`#project-${record.id}`}>{record.title}</a>,
    },
    {
      id: "details",
      header: "Details",
      cell: (record) => <a href={`#details-${record.id}`}>Details for {record.title}</a>,
    },
    {
      id: "actions",
      header: "Actions",
      layout: { rowActions: true, width: "6rem" },
      cell: (record) => (
        <Button
          variant="quiet"
          size="small"
          aria-label={`Inspect ${record.title}`}
          onPress={() => setInspected(record.title)}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        data={empty ? [] : manyRows ? manyItems : longContent ? longItems : items}
        columns={navigation ? navigationColumns : longContent ? longColumns : columns}
        density={density}
        stickyHeader={stickyHeader}
        getRowId={(item) => item.id}
        label="Projects"
        emptyMessage={emptyMessage}
        state={state}
        sorting={{
          value: sorting,
          onChange: setSorting,
          labels: {
            by: "Sort projects",
            original: "Original order",
            ascending: "ascending",
            descending: "descending",
          },
        }}
      />
      {inspected && <p role="status">Inspecting {inspected}</p>}
    </>
  );
};

const meta = { title: "Components/Data table", component: Preview } satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Compact: Story = { args: { density: "compact" } };
export const LongContent: Story = { args: { longContent: true } };
export const Empty: Story = { args: { empty: true } };
export const NoResults: Story = { args: { empty: true, emptyMessage: "No matching projects." } };
export const Loading: Story = {
  args: { empty: true, state: { type: "loading", message: "Loading projects…" } },
};
export const Refreshing: Story = {
  args: { state: { type: "loading", message: "Updating projects…" } },
};
export const LoadError: Story = {
  args: { empty: true, state: { type: "error", message: "Could not load projects." } },
};
export const RefreshError: Story = {
  args: {
    state: { type: "error", message: "Could not update projects. Showing previous results." },
  },
};
export const Navigation: Story = { args: { navigation: true } };
const manyItems: Item[] = Array.from({ length: 40 }, (_, index) => ({
  id: String(index),
  title: `Community project ${index + 1}`,
  amount: index * 10,
}));

export const NarrowContainer: Story = {
  args: { longContent: true },
  decorators: [
    (Story) => (
      <div style={{ width: "36rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
export const NarrowNavigation: Story = {
  ...NarrowContainer,
  args: { navigation: true, longContent: true },
};
export const StickyPageHeader: Story = {
  args: { manyRows: true, stickyHeader: { mode: "page", top: 48 } },
  decorators: [
    (Story) => (
      <>
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            background: "var(--surface)",
            zIndex: 2,
          }}
        >
          Fixed page header
        </div>
        <div style={{ paddingTop: 96 }}>
          <Story />
        </div>
        <div style={{ height: 1200 }} />
      </>
    ),
  ],
};
export const StickyTableHeader: Story = {
  args: { manyRows: true, stickyHeader: { mode: "table", maxHeight: "20rem" } },
};
