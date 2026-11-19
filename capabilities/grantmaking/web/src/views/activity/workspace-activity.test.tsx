import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ActivityEntry } from "@merit/grantmaking/api";
import { formatTimestamp } from "@merit/i18n/format";

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
  reason: null,
  record: { kind: "application", id: "b8q3w5j7c2df", title: "Workshop Saturdays" },
  ...overrides,
});

const show = (props: Partial<ComponentProps<typeof WorkspaceActivity>> = {}) => {
  const onFiltersChange = vi.fn();
  const onShowMore = vi.fn();

  const view = (overrides: Partial<ComponentProps<typeof WorkspaceActivity>> = {}) => (
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
      {...overrides}
    />
  );

  const result = render(view(), { wrapper: GrantmakingMessagesProvider });
  return {
    onFiltersChange,
    onShowMore,
    rerender: (overrides: Partial<ComponentProps<typeof WorkspaceActivity>>) =>
      result.rerender(view(overrides)),
  };
};

it("opens event details from the action and keeps the record as a separate native link", async () => {
  show({
    entries: [
      entry(1, {
        action: "round.budget_changed",
        provenance: { interface: "mcp", clientId: "grant-assistant" },
        record: { kind: "round", id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
        subject: { ...entry(1).subject, type: "round", revision: 4 },
      }),
    ],
  });

  const row = within(screen.getAllByRole("listitem")[0]!);
  const time = row.getByText(formatTimestamp("2027-01-20T12:00:00.000Z", "en-GB"));
  expect(time).toHaveAttribute("datetime", "2027-01-20T12:00:00.000Z");
  expect(row.getByText("Dana Reed")).toBeVisible();
  expect(screen.queryByText("via MCP client grant-assistant")).not.toBeInTheDocument();
  const link = row.getByRole("link", { name: "Local Connections 2027" });
  expect(link).toHaveAttribute("href", "/round/k7m2p9x4n6rt");
  expect(link.closest("button")).toBeNull();
  const trigger = row.getByRole("button", {
    name: "Round budget changed: Local Connections 2027 — view event details",
  });
  const user = userEvent.setup();
  trigger.focus();
  await user.keyboard("{Enter}");
  const drawer = screen.getByRole("dialog", { name: "Round budget changed" });
  expect(drawer).toHaveAttribute("data-modal-dialog", "end");
  const details = within(drawer);
  expect(details.getByRole("link", { name: "Local Connections 2027" })).toHaveAttribute(
    "href",
    "/round/k7m2p9x4n6rt",
  );
  expect(details.getByText("Dana Reed")).toBeVisible();
  expect(details.getByText("via MCP client grant-assistant")).toBeVisible();
  expect(details.queryByText("Recorded revision")).not.toBeInTheDocument();
  expect(details.getByText(formatTimestamp("2027-01-20T12:00:00.000Z", "en-GB"))).toHaveAttribute(
    "datetime",
    "2027-01-20T12:00:00.000Z",
  );
  expect(details.queryByText("Reason")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("names an unrecorded person, labels unknown actions generically and marks missing records", async () => {
  show({
    entries: [
      entry(1, {
        actor: null,
        provenance: null,
        action: "widget.polished",
        record: null,
        subject: { ...entry(1).subject, revision: null },
      }),
      entry(2, { action: "application.deleted", record: null }),
    ],
  });

  expect(screen.getByText("Unknown person")).toBeVisible();
  expect(screen.getByText("Changed")).toBeVisible();
  expect(screen.getByText("Application deleted")).toBeVisible();
  expect(screen.getAllByText("No longer available")).toHaveLength(2);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Changed: No longer available/ }));
  const details = within(screen.getByRole("dialog", { name: "Changed" }));
  expect(details.getByText("Unknown person")).toBeVisible();
  expect(details.getByText("Interface not recorded")).toBeVisible();
  expect(details.getByText("No longer available")).toBeVisible();
  expect(details.queryByRole("link")).not.toBeInTheDocument();
});

it("discloses the full recorded reason and restores focus on close", async () => {
  const actor = "Alexandria Catherine Montgomery-Featherstonehaugh of the Regional Community Fund";
  const reason =
    "The applicant found other funding.\nThe revised partnership will continue independently.";
  show({
    entries: [
      entry(1, { action: "application.withdraw", reason, actor }),
      entry(2, { action: "application.reinstate", reason: "The applicant returned." }),
    ],
  });

  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: /Application withdrawn:/ });
  expect(screen.queryByText(/The applicant found other funding/)).not.toBeInTheDocument();
  await user.click(trigger);
  let details = within(screen.getByRole("dialog", { name: "Application withdrawn" }));
  expect(details.getByText(/The applicant found other funding/).textContent).toBe(reason);
  expect(details.getByText(actor)).toBeVisible();
  expect(details.getByText("via Merit web")).toBeVisible();
  await user.click(details.getByRole("button", { name: "Close dialog" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(screen.getByRole("button", { name: /Application reinstated:/ }));
  details = within(screen.getByRole("dialog", { name: "Application reinstated" }));
  expect(details.getByText("The applicant returned.")).toBeVisible();
});

it("retains the recorded name for a deleted target and distinct events at the same instant", async () => {
  show({
    entries: [
      entry(1),
      entry(2, {
        action: "application.deleted",
        record: null,
        subject: { ...entry(2).subject, name: "Former project title" },
      }),
    ],
  });
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[1]!).getByText("Former project title", { selector: "span" })).toBeVisible();
  expect(within(rows[1]!).queryByRole("link")).not.toBeInTheDocument();
  await userEvent.click(within(rows[1]!).getByRole("button"));
  const details = within(screen.getByRole("dialog", { name: "Application deleted" }));
  expect(details.getByText("Former project title")).toBeVisible();
  expect(details.getByText("No longer available")).toBeVisible();
  expect(details.queryByRole("link")).not.toBeInTheDocument();
});

it("keeps an open drawer and its trigger stable while older entries arrive", async () => {
  const { rerender } = show();
  const trigger = screen.getByRole("button", { name: /view event details/ });
  await userEvent.click(trigger);
  rerender({ entries: [entry(1), entry(2)] });
  expect(screen.getByRole("dialog", { name: "Application recorded" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
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
    "application.withdraw",
    "application.reinstate",
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
  expect(new Set(screen.getAllByRole("listitem").map((row) => row.textContent)).size).toBe(
    actions.length,
  );
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
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(onFiltersChange).toHaveBeenCalledWith({ roundId: "", personId: "" });
});

it("changes the round and person filters independently", async () => {
  const user = userEvent.setup();
  const { onFiltersChange } = show({ filters: { roundId: "", personId: "dana" } });

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: /All rounds/ }));
  await user.click(screen.getByRole("option", { name: "Local Connections 2027" }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ roundId: "k7m2p9x4n6rt", personId: "dana" });

  await user.click(screen.getByRole("button", { name: "Person Dana Reed" }));
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

  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
});

it("announces refreshed activity and disables older activity until it settles", () => {
  show({ status: "refreshing", hasMore: true });

  expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Show older activity/ })).toBeDisabled();
});

it("announces older activity loading and marks its button pending", () => {
  show({ status: "loadingMore", hasMore: true });

  expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Show older activity/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("keeps entries visible and offers a retry after a failure", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  const { rerender } = show({ status: "failed", hasMore: true, onRetry });

  expect(screen.getByRole("alert")).toHaveTextContent("Activity could not be loaded.");
  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "Try again" });
  await user.click(retry);
  expect(onRetry).toHaveBeenCalledOnce();
  rerender({ status: "refreshing" });
  expect(screen.getByRole("button", { name: "Try again" })).toBe(retry);
  expect(retry).toHaveAttribute("aria-disabled", "true");
  expect(retry).toHaveFocus();
  rerender({ status: "ready" });
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show older activity" })).toBeVisible();
});

afterEach(() => vi.unstubAllGlobals());

const observePages = () => {
  const observers: {
    callback: IntersectionObserverCallback;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  return {
    observers,
    intersect: (isIntersecting = true, index = observers.length - 1) =>
      act(() => {
        observers[index]!.callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }),
  };
};

it("loads near the end once per page and reconnects after entries arrive", () => {
  const observer = observePages();
  const { onShowMore, rerender } = show({ hasMore: true });
  observer.intersect(false);
  expect(onShowMore).not.toHaveBeenCalled();
  observer.intersect();
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledTimes(1);
  rerender({ status: "loadingMore" });
  expect(observer.observers[0]!.disconnect).toHaveBeenCalled();
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledTimes(1);
  rerender({ entries: [entry(1), entry(2)], status: "ready" });
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledTimes(2);
  rerender({ hasMore: false });
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledTimes(2);
});

it.each(["automatic", "manual"])(
  "resumes %s paging after leaving a cancelled request and returning to the same entries",
  async (mode) => {
    const observer = observePages();
    const filters = { roundId: "k7m2p9x4n6rt", personId: "dana" };
    const { onShowMore, rerender } = show({ hasMore: true, filters });
    observer.intersect();
    rerender({ status: "loadingMore" });
    rerender({ filters: { roundId: "", personId: "" }, status: "refreshing" });
    rerender({ filters: { roundId: "", personId: "" }, status: "ready" });
    expect(onShowMore).toHaveBeenCalledOnce();
    rerender({ filters, status: "ready" });

    if (mode === "automatic") {
      observer.intersect();
      observer.intersect();
    } else {
      const user = userEvent.setup();
      const button = screen.getByRole("button", { name: "Show older activity" });
      await user.click(button);
      await user.click(button);
    }

    expect(onShowMore).toHaveBeenCalledTimes(2);
  },
);

it.each(["refreshing", "loadingMore", "failed"] as const)("does not observe while %s", (status) => {
  const observer = observePages();
  show({ status, hasMore: true });
  expect(observer.observers).toHaveLength(0);
});

it("stops automatic loading after failure and resumes only after a retry delivers entries", async () => {
  const observer = observePages();
  const onRetry = vi.fn();
  const { onShowMore, rerender } = show({ hasMore: true, onRetry });
  observer.intersect();
  rerender({ status: "failed" });
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledOnce();
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
  rerender({ status: "ready", entries: [entry(1), entry(2)] });
  observer.intersect();
  expect(onShowMore).toHaveBeenCalledTimes(2);
});

it("keeps manual loading available without IntersectionObserver and prevents repeated requests", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const { onShowMore } = show({ hasMore: true });
  const user = userEvent.setup();
  const button = screen.getByRole("button", { name: "Show older activity" });
  button.focus();
  await user.keyboard("{Enter}{Enter}");
  expect(onShowMore).toHaveBeenCalledOnce();
});

it("removes each active filter independently from the toolbar", async () => {
  const { onFiltersChange } = show({ filters: { roundId: "k7m2p9x4n6rt", personId: "dana" } });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Remove round filter/ }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ roundId: "", personId: "dana" });
  await user.click(screen.getByRole("button", { name: /Remove person filter/ }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ roundId: "k7m2p9x4n6rt", personId: "" });
});

it("announces initial loading without calling the workspace empty", () => {
  show({ entries: [], status: "refreshing" });
  expect(screen.getByRole("status")).toHaveTextContent("Loading activity…");
  expect(screen.queryByText("No activity yet.")).not.toBeInTheDocument();
});
