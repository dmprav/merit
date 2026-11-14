import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { ActivityEntry } from "@merit/grantmaking/api";

import { GrantmakingMessagesProvider } from "../../messages";
import { WorkspaceActivity } from "./workspace-activity";

const entry = (id: number, overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `00000000-0000-4000-a000-${String(id).padStart(12, "0")}`,
  recordedAt: "2027-01-20T12:00:00.000Z",
  actor: "Dana Reed",
  provenance: { interface: "web" },
  action: "application.created",
  subject: {
    type: "application",
    id: "b8q3w5j7c2df",
    revision: 0,
    name: null,
    roundId: null,
    applicationId: "b8q3w5j7c2df",
  },
  record: { kind: "application", id: "b8q3w5j7c2df", title: "Workshop Saturdays" },
  ...overrides,
});

const show = (props: Partial<ComponentProps<typeof WorkspaceActivity>> = {}) => {
  const onFiltersChange = vi.fn();
  const onShowMore = vi.fn();
  render(
    <WorkspaceActivity
      entries={[entry(1)]}
      people={[{ id: "dana", name: "Dana Reed" }]}
      rounds={[{ id: "k7m2p9x4n6rt", title: "Local Connections 2027" }]}
      filters={{ roundId: "", personId: "" }}
      onFiltersChange={onFiltersChange}
      hasMore={false}
      onShowMore={onShowMore}
      renderRecordLink={(record, label) => <a href={`/${record.kind}/${record.id}`}>{label}</a>}
      {...props}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  return { onFiltersChange, onShowMore };
};

it("shows when, who, what and the current record, linking to it", () => {
  show({
    entries: [
      entry(1, {
        action: "round.budget_changed",
        provenance: { interface: "mcp", clientId: "grant-assistant" },
        record: { kind: "round", id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
      }),
    ],
  });

  const row = within(screen.getAllByRole("row")[1]!);
  const time = row.getByText("20/01/2027, 12:00:00 UTC");
  expect(time).toHaveAttribute("datetime", "2027-01-20T12:00:00.000Z");
  expect(row.getByText("Dana Reed")).toBeVisible();
  expect(row.getByText("via MCP client grant-assistant")).toBeVisible();
  expect(row.getByText("Round budget changed")).toBeVisible();
  expect(row.getByRole("link", { name: "Local Connections 2027" })).toHaveAttribute(
    "href",
    "/round/k7m2p9x4n6rt",
  );
});

it("names an unrecorded person, labels unknown actions generically and marks missing records", () => {
  show({
    entries: [
      entry(1, { actor: null }),
      entry(2, { action: "widget.polished", record: null }),
      entry(3, { action: "application.deleted", record: null }),
    ],
  });

  expect(screen.getByText("Unknown person")).toBeVisible();
  expect(screen.getByText("Changed")).toBeVisible();
  expect(screen.getByText("Application deleted")).toBeVisible();
  expect(screen.getAllByText("No longer available")).toHaveLength(2);
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

it("labels every action the workspace records", () => {
  const actions = [
    "application.created",
    "application.material_changed",
    "application.summary_changed",
    "application.contact_changed",
    "application_working_revision.started",
    "application_working_revision.updated",
    "application_working_revision.discarded",
    "application.marked_ready",
    "application.revision_recorded",
    "application.correction_recorded",
    "application.deleted",
    "round.created",
    "round.budget_changed",
    "round.criteria_changed",
    "round.manager_changed",
    "round.deleted",
    "round.details_changed",
    "assessment.recorded",
    "assessment.submitted",
    "assessment.corrected",
    "assessment.amended",
    "recommendation.recorded",
    "review_request.created",
    "review_request.cancelled",
    "review_assignment.invited",
    "review_assignment.invitation_renewed",
    "review_assignment.accepted",
    "review_assignment.declined",
    "review_assignment.withdrawn",
    "review_assignment.conflict_reported",
    "review_assignment.conflict_cleared",
    "review_assignment.access_ended",
    "review_assignment.reinstated",
  ];
  show({ entries: actions.map((action, index) => entry(index + 1, { action })) });

  expect(screen.queryByText("Changed")).not.toBeInTheDocument();
  expect(
    new Set(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).size,
  ).toBe(actions.length);
});

it("explains an empty workspace without offering to clear filters", () => {
  show({ entries: [] });

  expect(screen.getByText("No activity yet.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
});

it("explains a filter without matches and clears both filters", async () => {
  const user = userEvent.setup();
  const { onFiltersChange } = show({
    entries: [],
    filters: { roundId: "k7m2p9x4n6rt", personId: "dana" },
  });

  expect(screen.getByText("No activity matches these filters.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(onFiltersChange).toHaveBeenCalledWith({ roundId: "", personId: "" });
});

it("changes the round and person filters independently", async () => {
  const user = userEvent.setup();
  const { onFiltersChange } = show({ filters: { roundId: "", personId: "dana" } });

  await user.click(screen.getByRole("button", { name: /All rounds/ }));
  await user.click(screen.getByRole("option", { name: "Local Connections 2027" }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ roundId: "k7m2p9x4n6rt", personId: "dana" });

  await user.click(screen.getByRole("button", { name: /Dana Reed/ }));
  await user.click(screen.getByRole("option", { name: "All people" }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ roundId: "", personId: "" });
});

it("offers older activity only when more remains", async () => {
  const user = userEvent.setup();
  const { onShowMore } = show({ hasMore: true });

  await user.click(screen.getByRole("button", { name: "Show older activity" }));
  expect(onShowMore).toHaveBeenCalledOnce();
});

it("offers no older activity once every entry is shown", () => {
  show({ hasMore: false });

  expect(screen.getByText("Workshop Saturdays")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
});

it("announces refreshed activity and disables older activity until it settles", () => {
  show({ status: "refreshing", hasMore: true });

  expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  expect(screen.getByText("Workshop Saturdays")).toBeVisible();
  expect(screen.getByRole("button", { name: /Show older activity/ })).toBeDisabled();
});

it("announces older activity loading and marks its button pending", () => {
  show({ status: "loadingMore", hasMore: true });

  expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  expect(screen.getByText("Workshop Saturdays")).toBeVisible();
  expect(screen.getByRole("button", { name: /Show older activity/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("keeps entries visible and offers a retry after a failure", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  show({ status: "failed", hasMore: true, onRetry });

  expect(screen.getByRole("alert")).toHaveTextContent("Activity could not be loaded.");
  expect(screen.getByText("Workshop Saturdays")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
