import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { createQueryClient } from "@merit/query";

import type {
  ApplicationListSource,
  ApplicationListOptions,
} from "../../contracts/application-list";
import { ApplicationListViews } from "./application-list-views";
import { applicationListOptions } from "./queries";
import { useApplicationList } from "./use-application-list";

const read = vi.fn<ApplicationListSource["read"]>();
const source: ApplicationListSource = {
  scope: (workspace) => ["applications-test", workspace],
  read,
};

beforeEach(() => {
  read.mockReset();
});

const application: ApplicationOverview = {
  id: "b8q3w5j7c2df",
  title: "Alder project",
  applicant: null,
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Grants",
  intakeStatus: "ready",
  withdrawn: false,
  requested: null,
  reviews: { current: 0, outstanding: 0, outdated: 0, unknown: 0 },
  criteriaChanged: false,
  recommendation: null,
};

const List = ({
  workspace,
  options = { viewId: "workspace" },
}: {
  workspace: string;
  options?: ApplicationListOptions;
}) => {
  const list = useApplicationList(source, workspace, options);
  return (
    <>
      <p>{list.applications.map((a) => a.title).join(",")}</p>
      <p>Offset {list.pagination.offset}</p>
      <p>Order {list.sorting?.columnId ?? "original"}</p>
      {list.pagination.failed && <p>Page failed</p>}
      <input
        aria-label="Search"
        value={list.query}
        onChange={(event) => list.onQueryChange(event.target.value)}
      />
      <button onClick={list.pagination.onNext}>Next</button>
      <button onClick={list.pagination.onRetry}>Retry</button>
      <button
        onClick={() => list.onSortingChange({ columnId: "application", direction: "ascending" })}
      >
        Sort by title
      </button>
      <button onClick={() => list.onFilterChange({ reviews: "awaiting", participation: "active" })}>
        Awaiting active
      </button>
      <button onClick={() => list.onFilterChange({})}>Remove criteria</button>
    </>
  );
};

it("restores the successful page after detail navigation and isolates it from another workspace", async () => {
  let finishBirch: (() => void) | undefined;
  read.mockImplementation(async (data) => {
    if (data.workspaceSlug === "birch") {
      await new Promise<void>((resolve) => {
        finishBirch = resolve;
      });
      return { status: "ok", applications: [], total: 0, matching: 0, offset: 0 };
    }
    return {
      status: "ok",
      applications: [{ ...application, title: `Alder page ${data.offset ?? 0}` }],
      offset: data.offset ?? 0,
      total: 55,
      matching: 55,
    };
  });
  const client = createQueryClient();

  const page = (workspace: string, mounted = true) => (
    <QueryClientProvider client={client}>
      <ApplicationListViews>{mounted && <List workspace={workspace} />}</ApplicationListViews>
    </QueryClientProvider>
  );

  const { rerender } = render(page("alder"));
  const user = userEvent.setup();
  expect(await screen.findByText("Alder page 0")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Alder page 50")).toBeVisible();
  rerender(page("alder", false));
  rerender(page("alder"));
  expect(await screen.findByText("Alder page 50")).toBeVisible();
  rerender(page("birch"));
  expect(screen.queryByText(/Alder page/)).not.toBeInTheDocument();
  expect(screen.getByText("Offset 0")).toBeVisible();
  await waitFor(() => expect(finishBirch).toBeDefined());
  finishBirch?.();
  await waitFor(() =>
    expect(
      read.mock.calls.some(
        ([request]) => request.workspaceSlug === "birch" && request.offset === 0,
      ),
    ).toBe(true),
  );
});

it("retains session sorting within an explicit view and resets the page when sorting changes", async () => {
  read.mockImplementation(async (input) => ({
    status: "ok",
    applications: [application],
    total: 120,
    matching: 120,
    offset: input.offset ?? 0,
  }));
  const client = createQueryClient();

  const page = (viewId: string, mounted = true) => (
    <QueryClientProvider client={client}>
      <ApplicationListViews>
        {mounted && <List workspace="alder" options={{ viewId }} />}
      </ApplicationListViews>
    </QueryClientProvider>
  );

  const user = userEvent.setup();
  const { rerender } = render(page("round-a"));
  await screen.findByText("Alder project");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Offset 50");
  await user.click(screen.getByRole("button", { name: "Sort by title" }));
  await screen.findByText("Offset 0");
  await waitFor(() =>
    expect(read.mock.lastCall?.[0]).toMatchObject({ sort: "application", offset: 0 }),
  );

  rerender(page("round-a", false));
  rerender(page("round-a"));
  expect(screen.getByText("Order application")).toBeVisible();
  rerender(page("round-b"));
  expect(screen.getByText("Order original")).toBeVisible();
  rerender(page("round-a"));
  expect(screen.getByText("Order application")).toBeVisible();
});

it("uses the supplied sorting value and action together without changing session sorting", async () => {
  read.mockImplementation(async (input) => ({
    status: "ok",
    applications: [application],
    total: 120,
    matching: 120,
    offset: input.offset ?? 0,
  }));
  const client = createQueryClient();
  const onChange = vi.fn();

  const page = (sorting?: ApplicationListOptions["sorting"]) => (
    <QueryClientProvider client={client}>
      <ApplicationListViews>
        <List workspace="alder" options={{ viewId: "workspace", sorting }} />
      </ApplicationListViews>
    </QueryClientProvider>
  );

  const user = userEvent.setup();
  const { rerender } = render(page({ value: null, onChange }));
  await screen.findByText("Alder project");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Offset 50");
  await user.click(screen.getByRole("button", { name: "Sort by title" }));
  expect(onChange).toHaveBeenCalledWith({ columnId: "application", direction: "ascending" });
  expect(screen.getByText("Order original")).toBeVisible();

  rerender(page({ value: { columnId: "application", direction: "ascending" }, onChange }));
  await screen.findByText("Offset 0");
  await waitFor(() =>
    expect(read.mock.lastCall?.[0]).toMatchObject({ sort: "application", offset: 0 }),
  );
  rerender(page());
  expect(screen.getByText("Order original")).toBeVisible();
});

it("keeps page positions independent for views with identical query filters", async () => {
  read.mockImplementation(async (input) => ({
    status: "ok",
    applications: [application],
    total: 120,
    matching: 120,
    offset: input.offset ?? 0,
  }));
  const client = createQueryClient();

  const page = (viewId: string) => (
    <QueryClientProvider client={client}>
      <ApplicationListViews>
        <List workspace="alder" options={{ viewId }} />
      </ApplicationListViews>
    </QueryClientProvider>
  );

  const user = userEvent.setup();
  const { rerender } = render(page("round"));
  await screen.findByText("Alder project");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Offset 50");

  rerender(page("workspace"));
  expect(await screen.findByText("Offset 0")).toBeVisible();
  rerender(page("round"));
  expect(await screen.findByText("Offset 50")).toBeVisible();
});

it("refreshes an invalidated nondefault page when returning from a detail", async () => {
  let title = "Before edit";
  read.mockImplementation(async (data) => ({
    status: "ok",
    applications: [{ ...application, title }],
    offset: data.offset ?? 0,
    total: 55,
    matching: 55,
  }));
  const client = createQueryClient();

  const page = (mounted: boolean) => (
    <QueryClientProvider client={client}>
      <ApplicationListViews>{mounted && <List workspace="alder" />}</ApplicationListViews>
    </QueryClientProvider>
  );

  const { rerender } = render(page(true));
  const user = userEvent.setup();
  expect(await screen.findByText("Before edit")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Offset 50")).toBeVisible();
  rerender(page(false));
  title = "After edit";
  await client.invalidateQueries({
    queryKey: applicationListOptions(source, { workspaceSlug: "alder" }).queryKey.slice(0, -1),
  });
  rerender(page(true));
  expect(await screen.findByText("After edit")).toBeVisible();
  expect(screen.getByText("Offset 50")).toBeVisible();
});

it("resets the page when combined criteria change or are removed and sends them in the request body", async () => {
  read.mockImplementation(async (data) => ({
    status: "ok",
    applications: [application],
    total: 120,
    matching: data.filter?.reviews ? 75 : 120,
    offset: data.offset ?? 0,
  }));
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <ApplicationListViews>
        <List workspace="alder" />
      </ApplicationListViews>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await screen.findByText("Alder project");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Offset 50");
  await user.click(screen.getByRole("button", { name: "Awaiting active" }));
  await screen.findByText("Offset 0");
  await waitFor(() =>
    expect(read.mock.lastCall?.[0]).toMatchObject({
      offset: 0,
      filter: { participation: "active", reviews: "awaiting" },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Offset 50");
  await user.click(screen.getByRole("button", { name: "Remove criteria" }));
  await screen.findByText("Offset 0");
  expect(screen.getByText("Alder project")).toBeVisible();
});

it("keeps the last successful page when the next page fails and moves to it after a retry", async () => {
  let failNext = true;
  read.mockImplementation(async (data) => {
    if (data.offset === 50 && failNext) {
      throw new Error("Read unavailable");
    }
    return {
      status: "ok",
      applications: [{ ...application, title: `Alder page ${data.offset ?? 0}` }],
      offset: data.offset ?? 0,
      total: 55,
      matching: 55,
    };
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ApplicationListViews>
        <List workspace="alder" />
      </ApplicationListViews>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  expect(await screen.findByText("Alder page 0")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Page failed")).toBeVisible();
  expect(screen.getByText("Alder page 0")).toBeVisible();
  expect(screen.getByText("Offset 0")).toBeVisible();

  failNext = false;
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Alder page 50")).toBeVisible();
  expect(screen.getByText("Offset 50")).toBeVisible();
  expect(screen.queryByText("Page failed")).not.toBeInTheDocument();
});

it("cancels an obsolete search and never presents its late result as current", async () => {
  let obsoleteSignal: AbortSignal | undefined;
  let finishObsolete: (() => void) | undefined;
  read.mockImplementation(async (data, signal) => {
    if (data.query === "Zebra") {
      obsoleteSignal = signal;
      await new Promise<void>((resolve) => {
        finishObsolete = resolve;
      });
    }
    return {
      status: "ok",
      applications: [{ ...application, title: `Results for ${data.query || "everything"}` }],
      offset: 0,
      total: 1,
      matching: 1,
    };
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ApplicationListViews>
        <List workspace="alder" />
      </ApplicationListViews>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  expect(await screen.findByText("Results for everything")).toBeVisible();
  const input = screen.getByRole("textbox", { name: "Search" });

  await user.type(input, "Zebra");
  await waitFor(() => expect(finishObsolete).toBeDefined());
  expect(screen.queryByText("Results for everything")).not.toBeInTheDocument();
  await user.clear(input);
  await user.type(input, "Art");
  await waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));
  finishObsolete?.();

  expect(await screen.findByText("Results for Art")).toBeVisible();
  expect(screen.queryByText("Results for Zebra")).not.toBeInTheDocument();
});
