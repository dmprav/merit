import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { PagedContent } from "./paged-content";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MessagesProvider messages={{}}>{children}</MessagesProvider>
);

it("renders static entries directly when no remote paging flags are supplied", () => {
  render(
    <PagedContent entries={["first", "second"]}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    {
      wrapper,
    },
  );

  expect(screen.getByText("first, second")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("announces loading before the first page arrives", () => {
  render(
    <PagedContent entries={[]} loaded={false} pending>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByRole("status")).toHaveTextContent("Loading history");
});

it("offers older entries below the loaded page while more remain", async () => {
  const more = vi.fn();
  const user = userEvent.setup();
  render(
    <PagedContent entries={["recent"]} loaded hasMore more={more}>
      {(entries, hasMore) => <p>{`${entries.join(", ")}:${hasMore}`}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByText("recent:true")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Load older entries" }));
  expect(more).toHaveBeenCalledOnce();
});

it("keeps loaded entries and replaces the older-entries control with a retry after a failed read", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(
    <PagedContent entries={["recent"]} loaded failed hasMore retry={retry}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByText("recent")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("History could not be loaded.");
  expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("hides entries and controls when access is denied", () => {
  render(
    <PagedContent entries={["secret"]} loaded denied hasMore>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByText("This history is no longer available.")).toBeVisible();
  expect(screen.queryByText("secret")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("retains the same retry control during recovery and announces completion only through the caller", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();

  const view = (fetching: boolean) => (
    <PagedContent entries={["kept"]} failed fetching={fetching} retry={retry}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>
  );

  const { rerender } = render(view(false), { wrapper });
  const control = screen.getByRole("button", { name: "Try again" });
  await user.click(control);
  expect(retry).toHaveBeenCalledOnce();
  rerender(view(true));
  expect(screen.getByRole("button", { name: "Try again" })).toBe(control);
  expect(control).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Loading history");
  expect(screen.getByText("kept")).toBeVisible();
});
