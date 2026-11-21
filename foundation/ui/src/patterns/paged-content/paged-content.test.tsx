import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { Toasts } from "../toast/toast";
import { PagedContent } from "./paged-content";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MessagesProvider messages={{}}>
    {children}
    <Toasts />
  </MessagesProvider>
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

it("keeps loaded entries usable and offers a retry toast after a failed read", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(
    <PagedContent entries={["recent"]} loaded failed hasMore retry={retry}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByText("recent")).toBeVisible();
  const toast = screen.getByRole("alertdialog", { name: "History could not be loaded." });
  expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument();
  await user.click(within(toast).getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("places recovery in the page when no entries could be shown", () => {
  render(
    <PagedContent entries={[]} loaded={false} failed retry={vi.fn()}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );

  expect(screen.getByRole("alert")).toHaveTextContent("History could not be loaded.");
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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

it("shows progress while a retry runs and announces completion only through the caller", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();

  const view = (fetching: boolean) => (
    <PagedContent entries={["kept"]} failed fetching={fetching} retry={retry}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>
  );

  const { rerender } = render(view(false), { wrapper });
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(view(true));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading history");
  expect(screen.getByText("kept")).toBeVisible();
});
