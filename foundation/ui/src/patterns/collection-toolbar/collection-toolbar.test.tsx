import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { CollectionFilter, CollectionToolbar } from "./collection-toolbar";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

const Example = ({
  initialQuery = "",
  hideChips = false,
}: {
  initialQuery?: string;
  hideChips?: boolean;
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("all");
  return (
    <CollectionToolbar
      filterLabel="Filter"
      filterTitle="Filter projects"
      filters={
        <CollectionFilter
          label="Status"
          selectedKey={filter}
          onSelectionChange={setFilter}
          items={[
            { id: "all", label: "All" },
            { id: "ready", label: "Ready" },
          ]}
        />
      }
      chips={
        filter === "all" || hideChips
          ? []
          : [
              {
                id: filter,
                label: "Ready",
                removeLabel: "Remove Ready filter",
                onRemove: () => setFilter("all"),
              },
            ]
      }
      reset={{
        label: "Reset",
        isDisabled: filter === "all" && !query,
        onReset: () => {
          setFilter("all");
          setQuery("");
        },
      }}
      search={{
        label: "Search projects",
        clearLabel: "Clear search",
        value: query,
        onChange: setQuery,
      }}
      summary={filter === "all" ? "All projects" : "Ready projects"}
    />
  );
};

it("keeps search inside the filter panel and retains a removable query on Escape", async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  const filter = screen.getByRole("button", { name: "Filter" });
  await user.click(filter);
  const dialog = screen.getByRole("dialog", { name: "Filter projects" });
  const input = screen.getByRole("searchbox", { name: "Search projects" });
  expect(dialog).toContainElement(input);
  expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, "Community");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(filter).toHaveFocus());
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Clear search: Search projects: Community" }),
  ).toBeVisible();
  await user.click(filter);
  expect(screen.getByRole("searchbox")).toHaveValue("Community");
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await waitFor(() => expect(filter).toHaveFocus());
});

it("shows a restored query as a chip and focuses the filter trigger when removing it", async () => {
  const user = userEvent.setup();
  render(<Example initialQuery="Restored" />);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear search: Search projects: Restored" }));
  expect(screen.queryByText("Restored")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Filter" })).toHaveFocus();
});

it("keeps filter controls and active reset inside the panel and exposes removable filters", async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  const filter = screen.getByRole("button", { name: "Filter" });
  await user.click(filter);
  expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Status All" }));
  await user.click(screen.getByRole("option", { name: "Ready" }));
  expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Status Ready" })).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(filter).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("Ready projects");
  await user.click(screen.getByRole("button", { name: "Remove Ready filter" }));
  expect(screen.queryByRole("button", { name: "Remove Ready filter" })).not.toBeInTheDocument();
  await waitFor(() => expect(filter).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("All projects");
});

it("resets active values inside the panel and preserves focus when reset disappears", async () => {
  const user = userEvent.setup();
  render(<Example initialQuery="Community" />);
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
});

it("uses the feature's reset state even when an active criterion has no chip", async () => {
  const user = userEvent.setup();
  render(<Example hideChips />);
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Status All" }));
  await user.click(screen.getByRole("option", { name: "Ready" }));

  expect(screen.queryByRole("button", { name: "Remove Ready filter" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("button", { name: "Status All" })).toBeVisible();
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
});

it("dismisses the panel on an outside press without discarding the query", async () => {
  const user = userEvent.setup();
  render(<Example initialQuery="Community" />);
  const filter = screen.getByRole("button", { name: "Filter" });
  await user.click(filter);
  await user.click(document.body);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(filter).toHaveFocus());
  expect(
    screen.getByRole("button", { name: "Clear search: Search projects: Community" }),
  ).toBeVisible();
});

it("applies keyboard selection immediately and Escape closes only the nested selector first", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const filter = screen.getByRole("button", { name: "Filter" });
  await user.click(filter);
  await user.tab();
  const criterion = screen.getByRole("button", { name: "Status All" });
  expect(criterion).toHaveFocus();
  await user.keyboard("{Enter}{End}{Enter}");
  expect(criterion).toHaveTextContent("Ready");
  expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
  await waitFor(() => expect(criterion).toHaveFocus());
  await user.keyboard("{Enter}{Home}{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Filter projects" })).toBeVisible();
  expect(criterion).toHaveTextContent("Ready");
  await waitFor(() => expect(criterion).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(filter).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("Ready projects");
});
