import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";

import { CollectionFilter, CollectionToolbar } from "./collection-toolbar";

const Preview = ({
  initialQuery = "",
  filterLabel = "Ready",
  initialFilter = "all",
  withSearch = true,
  multipleFilters = false,
}: {
  initialQuery?: string;
  filterLabel?: string;
  initialFilter?: string;
  withSearch?: boolean;
  multipleFilters?: boolean;
}) => {
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
              { id: "ready", label: filterLabel },
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
                label: filterLabel,
                removeLabel: `Remove ${filterLabel} filter`,
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

const meta = { title: "Patterns/Collection toolbar", component: Preview } satisfies Meta<
  typeof Preview
>;

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
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
  },
};

export const MultipleFilters: Story = {
  args: { multipleFilters: true },
  play: Panel.play,
};

export const WithoutSearch: Story = {
  args: { withSearch: false, multipleFilters: true },
  play: Panel.play,
};

export const LongValues: Story = {
  args: {
    initialFilter: "ready",
    filterLabel: "Ready for a recommendation meeting with the community advisory group",
    initialQuery: "Community support for neighbourhood organisations and long-term collaboration",
  },
};

export const LongValuesPanel: Story = {
  args: { ...LongValues.args, multipleFilters: true },
  play: Panel.play,
};

export const KeyboardSelection: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const filter = canvas.getByRole("button", { name: "Filter" });
    await userEvent.tab();
    await expect(filter).toHaveFocus();
    await userEvent.keyboard("{Enter}{Tab}");
    const criterion = body.getByRole("button", { name: "Status All projects" });
    await expect(criterion).toHaveFocus();
    await userEvent.keyboard("{Enter}{End}{Enter}");
    await expect(criterion).toHaveTextContent("Ready");
    await expect(body.getByRole("dialog", { name: "Filter projects" })).toBeVisible();
    await waitFor(() => expect(criterion).toHaveFocus());
    await userEvent.keyboard("{Enter}{Home}{Escape}");
    await expect(body.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(criterion).toHaveFocus());
    await expect(criterion).toHaveTextContent("Ready");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(filter).toHaveFocus());
    await expect(canvas.getByRole("button", { name: "Remove Ready filter" })).toBeVisible();
  },
};
