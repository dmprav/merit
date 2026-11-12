import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { assert, expect, expectTypeOf, it } from "vite-plus/test";

import {
  DataTable,
  type TableSort,
  type TableColumn,
  type TableSorting,
  type TableState,
} from "../src/index";

type Item = { id: string; name: string; amount?: number | null };

const data: Item[] = [
  { id: "b", name: "Birch", amount: 10 },
  { id: "c", name: "Cedar" },
  { id: "a", name: "Alder", amount: 0 },
];
const columns: TableColumn<Item>[] = [
  {
    id: "name",
    header: "Name",
    cell: (item) => item.name,
    sort: {
      value: (item) => item.name,
      compare: (a, b) => a.name.localeCompare(b.name),
    },
  },
  {
    id: "amount",
    header: "Amount",
    cell: (item) => item.amount ?? "—",
    sort: {
      value: (item) => item.amount,
      compare: (a, b) => (a.amount ?? 0) - (b.amount ?? 0),
    },
  },
];

const Example = ({
  items = data,
  state,
  emptyMessage = "No items yet.",
  initialSort = null,
  stickyHeader,
}: {
  items?: Item[];
  state?: TableState;
  emptyMessage?: string;
  initialSort?: TableSort;
  stickyHeader?: ComponentProps<typeof DataTable>["stickyHeader"];
}) => {
  const [sorting, setSorting] = useState<TableSort>(initialSort);

  return (
    <DataTable
      data={items}
      columns={columns}
      getRowId={(item) => item.id}
      label="Items"
      emptyMessage={emptyMessage}
      state={state}
      stickyHeader={stickyHeader}
      sorting={{
        value: sorting,
        onChange: setSorting,
        labels: {
          by: "Sort items",
          original: "Original order",
          ascending: "ascending",
          descending: "descending",
        },
      }}
    />
  );
};

const names = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => {
      const cell = within(row).getAllByRole("cell")[0];

      assert.isDefined(cell);

      return cell.textContent;
    });

it("limits the focusable scroll region to table mode while preserving sorting across mode changes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Example stickyHeader={{ mode: "table", maxHeight: "20rem" }} />);
  const region = screen.getByRole("region", { name: "Items" });
  const table = within(region).getByRole("table", { name: "Items" });

  expect(region.style.maxHeight).toBe("20rem");
  screen.getByRole("button", { name: /Sort items/ }).focus();
  await user.tab();

  expect(region).toHaveFocus();

  await user.tab();
  const name = screen.getByRole("button", { name: "Name" });

  expect(name).toHaveFocus();

  await user.keyboard("{Enter}");
  rerender(<Example stickyHeader={{ mode: "page", top: 48 }} />);

  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(region).not.toHaveAttribute("tabindex");
  expect(region).not.toHaveAttribute("aria-label");
  expect(region.style.maxHeight).toBe("");
  expect(name.closest("th")).toHaveStyle({ top: "48px" });
  expect(screen.getByRole("table", { name: "Items" })).toBe(table);
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(name).toHaveFocus();

  rerender(<Example />);

  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(region).not.toHaveAttribute("data-scroll");
  expect(table).not.toHaveAttribute("data-sticky");
  expect(name.closest("th")).not.toHaveStyle({ top: "48px" });
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(name).toHaveFocus();
});

it("cycles sorting with the keyboard, keeps focus and restores source order without mutation", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const name = screen.getByRole("button", { name: "Name" });
  name.focus();
  await user.keyboard("{Enter}");

  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(name.closest("th")).toHaveAttribute("aria-sort", "ascending");

  await user.keyboard(" ");

  expect(names()).toEqual(["Cedar", "Birch", "Alder"]);
  expect(name.closest("th")).toHaveAttribute("aria-sort", "descending");

  await user.keyboard("{Enter}");

  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(name.closest("th")).not.toHaveAttribute("aria-sort");
  expect(name).toHaveFocus();
  expect(data.map((item) => item.id)).toEqual(["b", "c", "a"]);
});

it("keeps missing values last in both directions and re-sorts updated data", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Example />);
  const amount = screen.getByRole("button", { name: "Amount" });
  await user.click(amount);

  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);

  await user.click(amount);

  expect(names()).toEqual(["Birch", "Alder", "Cedar"]);

  rerender(
    <Example items={data.map((item) => (item.id === "a" ? { ...item, amount: 20 } : item))} />,
  );

  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
});

it("places empty and no-results messages in a full-width table cell beneath the headings", () => {
  const { rerender } = render(<Example items={[]} />);

  expect(screen.getByRole("status")).toHaveTextContent("No items yet.");
  expect(screen.getByRole("columnheader", { name: /Name/ })).toBeVisible();
  const cell = within(screen.getByRole("table")).getByRole("cell");
  expect(cell).toHaveAttribute("colspan", String(columns.length));
  expect(within(cell).getByRole("status")).toHaveTextContent("No items yet.");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<Example items={[]} emptyMessage="No matching items." />);

  expect(within(cell).getByRole("status")).toHaveTextContent("No matching items.");
});

it("shows loading and error messages instead of empty content, then renders loaded rows", () => {
  const { rerender } = render(
    <Example items={[]} state={{ type: "loading", message: "Loading items…" }} />,
  );

  expect(screen.getByRole("status")).toHaveTextContent("Loading items…");
  expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("No items yet.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<Example items={[]} state={{ type: "error", message: "Could not load items." }} />);

  expect(screen.getByRole("alert")).toHaveTextContent("Could not load items.");
  expect(screen.getByRole("table")).not.toHaveAttribute("aria-busy");

  rerender(<Example />);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
});

it("preserves sorted rows and focused controls during refresh and recoverable errors", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Example />);
  const name = screen.getByRole("button", { name: "Name" });
  await user.click(name);
  rerender(<Example state={{ type: "loading", message: "Updating items…" }} />);

  expect(screen.getByRole("status")).toHaveTextContent("Updating items…");
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(name).toHaveFocus();

  rerender(
    <Example
      state={{ type: "error", message: "Could not update items. Showing previous results." }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Showing previous results.");
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(name).toHaveFocus();
  expect(screen.getByRole("table")).not.toHaveAttribute("aria-busy");
});

it("uses one selection for the mobile control, heading, and row order when changing columns", async () => {
  const user = userEvent.setup();
  render(
    <Example
      items={data.map((item) => (item.id === "c" ? { ...item, amount: 10 } : item))}
      initialSort={{ columnId: "name", direction: "descending" }}
    />,
  );
  const select = screen.getByRole("button", { name: /Sort items/ });

  expect(names()).toEqual(["Cedar", "Birch", "Alder"]);
  expect(select).toHaveTextContent("Name (descending)");

  await user.click(select);
  await user.click(screen.getByRole("option", { name: "Amount (descending)" }));

  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(select).toHaveTextContent("Amount (descending)");
  expect(screen.getByRole("button", { name: "Name" }).closest("th")).not.toHaveAttribute(
    "aria-sort",
  );
  expect(screen.getByRole("button", { name: "Amount" }).closest("th")).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  await user.click(screen.getByRole("button", { name: "Name" }));

  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
  expect(select).toHaveTextContent("Name (ascending)");

  await user.click(select);
  await user.click(screen.getByRole("option", { name: "Original order" }));

  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(screen.getByRole("table").querySelector("[aria-sort]")).toBeNull();
});

it("renders source order without sorting controls when sorting is omitted", () => {
  render(
    <DataTable
      data={data}
      columns={columns}
      getRowId={(item) => item.id}
      label="Items"
      emptyMessage="No items."
    />,
  );

  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("keeps null and undefined values last without passing them to the comparator", async () => {
  const user = userEvent.setup();

  const compareAmounts = (left: Item, right: Item) => {
    assert(typeof left.amount === "number");
    assert(typeof right.amount === "number");
    return left.amount - right.amount;
  };

  const amountColumns: TableColumn<Item>[] = [
    { id: "name", header: "Name", cell: (item) => item.name },
    {
      id: "amount",
      header: "Amount",
      cell: (item) => item.amount ?? "—",
      sort: { value: (item) => item.amount, compare: compareAmounts },
    },
  ];

  const MissingValues = () => {
    const [value, onChange] = useState<TableSort>(null);
    return (
      <DataTable
        data={[...data, { id: "d", name: "Dogwood", amount: null }]}
        columns={amountColumns}
        getRowId={(item) => item.id}
        label="Items"
        emptyMessage="No items."
        sorting={{
          value,
          onChange,
          labels: {
            by: "Sort items",
            original: "Original order",
            ascending: "ascending",
            descending: "descending",
          },
        }}
      />
    );
  };

  render(<MissingValues />);

  await user.click(screen.getByRole("button", { name: "Amount" }));
  expect(names()).toEqual(["Alder", "Birch", "Cedar", "Dogwood"]);

  await user.click(screen.getByRole("button", { name: "Amount" }));
  expect(names()).toEqual(["Birch", "Alder", "Cedar", "Dogwood"]);
});

it("uses source order for a selection whose column is absent or no longer sortable", () => {
  const value: TableSort = { columnId: "name", direction: "ascending" };

  const renderColumns = (shownColumns: TableColumn<Item>[]) => (
    <DataTable
      data={data}
      columns={shownColumns}
      getRowId={(item) => item.id}
      label="Items"
      emptyMessage="No items."
      sorting={{
        value,
        onChange: () => {},
        labels: {
          by: "Sort items",
          original: "Original order",
          ascending: "ascending",
          descending: "descending",
        },
      }}
    />
  );

  const { rerender } = render(renderColumns(columns));
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);

  rerender(
    renderColumns(
      columns.map((column) => (column.id === "name" ? { ...column, sort: undefined } : column)),
    ),
  );
  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(screen.getByRole("button", { name: /Sort items/ })).toHaveTextContent("Original order");
  expect(screen.getByRole("table").querySelector("[aria-sort]")).toBeNull();

  rerender(
    renderColumns(
      columns.map((column) => (column.id === "name" ? { ...column, id: "renamed" } : column)),
    ),
  );
  expect(names()).toEqual(["Birch", "Cedar", "Alder"]);
  expect(screen.getByRole("button", { name: /Sort items/ })).toHaveTextContent("Original order");

  rerender(renderColumns(columns));
  expect(names()).toEqual(["Alder", "Birch", "Cedar"]);
});

const EditableName = ({ item }: { item: Item }) => {
  const [name, setName] = useState(item.name);
  return (
    <input aria-label={item.id} value={name} onChange={(event) => setName(event.target.value)} />
  );
};

it("preserves cell state and focus when render callbacks and record objects are recreated", async () => {
  const user = userEvent.setup();

  const renderItems = (items: Item[]) => (
    <DataTable
      data={items}
      columns={[{ id: "name", header: "Name", cell: (item) => <EditableName item={item} /> }]}
      getRowId={(item) => item.id}
      label="Items"
      emptyMessage="No items."
    />
  );

  const { rerender } = render(renderItems(data));
  const input = screen.getByRole("textbox", { name: "b" });
  await user.type(input, " draft");

  rerender(renderItems(data.map((item) => ({ ...item })).reverse()));

  expect(screen.getByRole("textbox", { name: "b" })).toBe(input);
  expect(input).toHaveValue("Birch draft");
  expect(input).toHaveFocus();
});

it("limits the public contract to a single sort and complete sorting configuration", () => {
  expectTypeOf<TableSort>().toEqualTypeOf<{
    columnId: string;
    direction: "ascending" | "descending";
  } | null>();
  expectTypeOf<Pick<TableSorting, "value" | "labels">>().not.toExtend<TableSorting>();
  expectTypeOf<{ value: (item: Item) => number }>().not.toExtend<
    NonNullable<TableColumn<Item>["sort"]>
  >();
  expectTypeOf<TableColumn<Item>>().not.toHaveProperty("sortUndefined");
  expectTypeOf<TableColumn<Item>>().not.toHaveProperty("footer");
});
