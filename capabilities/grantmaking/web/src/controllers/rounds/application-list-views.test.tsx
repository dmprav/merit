import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import { ApplicationListViews, useApplicationListView } from "./application-list-views";

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

it("keeps rounds independent and clears search, filters, and sorting when the session remounts", async () => {
  const user = userEvent.setup();

  const page = (roundId: string, session = "first") => (
    <ApplicationListViews key={session}>
      <List roundId={roundId} />
    </ApplicationListViews>
  );

  const { rerender } = render(page("alder-round"));
  await user.click(screen.getByRole("button", { name: "all Default order" }));

  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();

  rerender(page("birch-round"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();

  rerender(page("alder-round"));

  expect(screen.getByRole("button", { name: "repair awaiting Descending" })).toBeVisible();

  rerender(page("alder-round", "next"));

  expect(screen.getByRole("button", { name: "all Default order" })).toBeVisible();
});
