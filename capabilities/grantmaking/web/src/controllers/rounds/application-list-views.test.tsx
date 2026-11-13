import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import {
  ApplicationListViews,
  useApplicationListView,
  useWorkspaceApplicationList,
} from "./application-list-views";

const List = ({ roundId }: { roundId: string }) => {
  const { sorting, onSortingChange, query, filter, onFilterChange } =
    useApplicationListView(roundId);

  return (
    <button
      onClick={() => {
        onSortingChange({ columnId: "application", direction: "descending" });
        onFilterChange({ query: "repair", filter: "awaiting" });
      }}
    >
      {`${query} ${filter} ${sorting ? "Descending" : "Default order"}`}
    </button>
  );
};

const WorkspaceList = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { query, onQueryChange } = useWorkspaceApplicationList(workspaceSlug);

  return (
    <button onClick={() => onQueryChange("collective")}>{`workspace:${query || "empty"}`}</button>
  );
};

it("keeps rounds and workspaces independent and clears search, filters, and sorting when the session remounts", async () => {
  const user = userEvent.setup();

  const page = (id: string, session = "first") => (
    <ApplicationListViews key={session}>
      <List roundId={id} />
      <WorkspaceList workspaceSlug={id} />
    </ApplicationListViews>
  );

  const { rerender } = render(page("alder-round"));
  await user.click(screen.getByRole("button", { name: "all Default order" }));

  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:empty" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "workspace:empty" }));

  expect(screen.getByRole("button", { name: "workspace:collective" })).toBeVisible();
  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();

  rerender(page("birch-round"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:empty" })).toBeVisible();

  rerender(page("alder-round"));

  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:collective" })).toBeVisible();

  rerender(page("alder-round", "next"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:empty" })).toBeVisible();
});
