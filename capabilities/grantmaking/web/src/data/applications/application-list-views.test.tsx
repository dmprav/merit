import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import { ApplicationListViews, useApplicationListView } from "./application-list-views";

const List = ({ roundId }: { roundId: string }) => {
  const { sorting, onSortingChange, query, filter, onFilterChange, onQueryChange } =
    useApplicationListView(roundId);

  return (
    <button
      onClick={() => {
        onSortingChange({ columnId: "application", direction: "descending" });
        onQueryChange("repair");
        onFilterChange({ reviews: "awaiting" });
      }}
    >
      {`${query} ${filter.reviews ?? "all"} ${sorting ? "Descending" : "Default order"}`}
    </button>
  );
};

const WorkspaceList = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { query, onQueryChange, filter, onFilterChange } = useApplicationListView(
    `workspace/${workspaceSlug}`,
  );

  return (
    <button
      onClick={() => {
        onQueryChange("collective");
        onFilterChange({ participation: "active", evidence: "changed" });
      }}
    >{`workspace:${query || "empty"}:${filter.participation ?? "any"}:${filter.evidence ?? "any"}`}</button>
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
  expect(screen.getByRole("button", { name: "workspace:empty:any:any" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "workspace:empty:any:any" }));

  expect(screen.getByRole("button", { name: "workspace:collective:active:changed" })).toBeVisible();
  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();

  rerender(page("birch-round"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:empty:any:any" })).toBeVisible();

  rerender(page("alder-round"));

  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:collective:active:changed" })).toBeVisible();

  rerender(page("alder-round", "next"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();
  expect(screen.getByRole("button", { name: "workspace:empty:any:any" })).toBeVisible();
});
