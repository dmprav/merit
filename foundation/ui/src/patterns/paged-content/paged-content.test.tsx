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

it("renders loading, failure retry, and load-more controls from state props", async () => {
  const retry = vi.fn();
  const more = vi.fn();
  const user = userEvent.setup();

  const { rerender } = render(
    <PagedContent entries={[]} loaded={false} pending>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
    { wrapper },
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading history");

  rerender(
    <PagedContent entries={["recent"]} loaded hasMore more={more}>
      {(entries, hasMore) => <p>{`${entries.join(", ")}:${hasMore}`}</p>}
    </PagedContent>,
  );
  expect(screen.getByText("recent:true")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Load older entries" }));
  expect(more).toHaveBeenCalledTimes(1);

  rerender(
    <PagedContent entries={["recent"]} loaded failed hasMore retry={retry}>
      {(entries) => <p>{entries.join(", ")}</p>}
    </PagedContent>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("History could not be loaded.");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
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
