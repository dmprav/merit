import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { CollectionFilter, CollectionToolbar } from "./collection-toolbar";

const Preview = ({
  initialQuery = "",
  readyLabel = "Ready",
  initialFilter = "all",
  withSearch = true,
  multipleFilters = false,
}: PreviewProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const [round, setRound] = useState("all");
  return (
    <CollectionToolbar
      filterLabel="Filter"
      filterTitle="Filter projects"
      filters={
        <>
          <CollectionFilter
            label="Status"
            selectedKey={filter}
            onSelectionChange={setFilter}
            items={[
              { id: "all", label: "All projects" },
              { id: "ready", label: readyLabel },
            ]}
          />
          {multipleFilters && (
            <CollectionFilter
              label="Round"
              selectedKey={round}
              onSelectionChange={setRound}
              items={[
                { id: "all", label: "All rounds" },
                { id: "community", label: "Community grants 2026" },
              ]}
            />
          )}
        </>
      }
      chips={[
        ...(filter === "all"
          ? []
          : [
              {
                id: filter,
                label: readyLabel,
                removeLabel: `Remove ${readyLabel} filter`,
                onRemove: () => setFilter("all"),
              },
            ]),
        ...(round === "all"
          ? []
          : [
              {
                id: "round",
                label: "Community grants 2026",
                removeLabel: "Remove round filter",
                onRemove: () => setRound("all"),
              },
            ]),
      ]}
      reset={{
        label: "Reset",
        isDisabled: filter === "all" && round === "all" && !query,
        onReset: () => {
          setFilter("all");
          setQuery("");
          setRound("all");
        },
      }}
      search={
        withSearch
          ? {
              label: "Search projects",
              clearLabel: "Clear search",
              value: query,
              onChange: setQuery,
            }
          : undefined
      }
      summary={filter === "all" ? "12 projects" : "5 of 12 projects"}
    />
  );
};

type PreviewProps = {
  initialQuery?: string;
  readyLabel?: string;
  initialFilter?: string;
  withSearch?: boolean;
  multipleFilters?: boolean;
};

type StoryArgs = React.ComponentProps<typeof CollectionToolbar> & PreviewProps;

const meta = {
  title: "Patterns/Collection toolbar",
  component: CollectionToolbar,
  subcomponents: { CollectionFilter },
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
  args: { filterLabel: "Filter", filterTitle: "Filter projects", filters: null },
  render: ({ initialQuery, readyLabel, initialFilter, withSearch, multipleFilters }) => (
    <Preview
      initialQuery={initialQuery}
      readyLabel={readyLabel}
      initialFilter={initialFilter}
      withSearch={withSearch}
      multipleFilters={multipleFilters}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filtering: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await userEvent.click(body.getByRole("button", { name: "Status All projects" }));
    await userEvent.click(body.getByRole("option", { name: "Ready" }));
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByRole("button", { name: "Remove Ready filter" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("5 of 12 projects");
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await userEvent.type(body.getByRole("searchbox"), "Community");
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByRole("button", { name: "Clear search: Search projects: Community" }),
    ).toBeVisible();
  },
};

export const Panel: Story = {
  args: { multipleFilters: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
  },
};

export const WithoutSearch: Story = {
  args: { withSearch: false, multipleFilters: true },
  play: Panel.play,
};

export const LongValues: Story = {
  args: {
    initialFilter: "ready",
    readyLabel: "Ready for a recommendation meeting with the community advisory group",
    initialQuery: "Community support for neighbourhood organisations and long-term collaboration",
  },
};

export const LongValuesPanel: Story = {
  args: { ...LongValues.args, multipleFilters: true },
  play: Panel.play,
};
