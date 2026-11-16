import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import type { TableSort } from "@merit/tables";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationsOverviewPreview as ApplicationsOverview } from "../../testing/application-list-preview";

const rounds = [
  { id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
  { id: "h7m2p9x4n6rt", title: "Community grants 2028" },
  { id: "0123456789ab", title: "Empty round" },
] as const;

const makeOverview = (
  overrides: Partial<ApplicationOverview> & Pick<ApplicationOverview, "id" | "title">,
): ApplicationOverview => ({
  applicant: "Repair Collective",
  roundId: rounds[0].id,
  roundTitle: rounds[0].title,
  intakeStatus: "ready",
  withdrawn: false,
  requested: null,
  reviews: { current: 1, outdated: 0, outstanding: 0, unknown: 0 },
  criteriaChanged: false,
  recommendation: {
    position: "Fund",
    outdated: false,
    allocation: { minorUnits: "0", currency: "EUR" as const },
  },
  ...overrides,
});

const overviewFixtures: readonly ApplicationOverview[] = [
  makeOverview({
    id: "a11111111111",
    title: "Preparing project",
    applicant: null,
    intakeStatus: "in_preparation",
    reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
    recommendation: null,
  }),
  makeOverview({
    id: "a22222222222",
    title: "Awaiting project",
    applicant: "River Trust",
    reviews: { current: 1, outdated: 0, outstanding: 1, unknown: 0 },
  }),
  makeOverview({
    id: "a33333333333",
    title: "Outdated review project",
    applicant: "Harbour Guild",
    roundId: rounds[1].id,
    roundTitle: rounds[1].title,
    reviews: { current: 0, outdated: 1, outstanding: 0, unknown: 0 },
  }),
  makeOverview({
    id: "a44444444444",
    title: "Criteria changed project",
    applicant: "Meadow Co-op",
    criteriaChanged: true,
  }),
  makeOverview({
    id: "a55555555555",
    title: "Outdated recommendation project",
    applicant: "North Kitchen",
    recommendation: {
      position: "Defer",
      outdated: true,
      allocation: { minorUnits: "0", currency: "EUR" as const },
    },
  }),
  makeOverview({
    id: "a66666666666",
    title: "Unknown review basis project",
    applicant: "Station Arts",
    reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 1 },
  }),
  makeOverview({
    id: "a77777777777",
    title: "Withdrawn project",
    withdrawn: true,
    requested: null,
    reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 1 },
    criteriaChanged: true,
    recommendation: null,
  }),
];

const OverviewHarness = ({
  applications = overviewFixtures,
  initialRoundId = "",
}: {
  applications?: readonly ApplicationOverview[];
  initialRoundId?: string;
}) => {
  const [roundId, setRoundId] = useState(initialRoundId);
  const [sorting, setSorting] = useState<TableSort>(null);

  return (
    <ApplicationsOverview
      applications={applications}
      rounds={rounds}
      roundId={roundId}
      onRoundChange={setRoundId}
      sorting={sorting}
      onSortingChange={setSorting}
      renderApplicationLink={(item, label, reviews) => (
        <a href={`/app/alder/applications/${item.id}${reviews ? "?tab=reviews" : ""}`}>{label}</a>
      )}
      renderRoundLink={(item) => (
        <a href={`/app/alder/rounds/${item.roundId}`}>{item.roundTitle}</a>
      )}
    />
  );
};

describe("workspace applications overview", () => {
  it("matches every work-state filter against overview records", async () => {
    const user = userEvent.setup();
    render(<OverviewHarness />, { wrapper: GrantmakingMessagesProvider });

    expect(
      within(screen.getByRole("row", { name: /Outdated recommendation project/ })).getByRole(
        "button",
        { name: "Recommendation uses an earlier version" },
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Criteria changed project/ })).getByRole("button", {
        name: "Review details for Criteria changed project",
      }),
    ).toBeVisible();

    const cases = [
      ["Participation", "Withdrawn", ["Withdrawn project"]],
      ["Readiness", "In preparation", ["Preparing project"]],
      ["Reviews", "Awaiting reviews", ["Awaiting project", "Withdrawn project"]],
      ["Reviews", "No reviewers assigned", ["Preparing project"]],
      [
        "Evidence",
        "Changed evidence or criteria",
        [
          "Outdated review project",
          "Criteria changed project",
          "Outdated recommendation project",
          "Withdrawn project",
        ],
      ],
      ["Evidence", "Review basis not known", ["Unknown review basis project", "Withdrawn project"]],
      ["Recommendation", "No recommendation", ["Preparing project", "Withdrawn project"]],
    ] as const;

    for (const [criterion, value, expected] of cases) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
      await user.click(screen.getByRole("button", { name: `${criterion} Any` }));
      await user.click(screen.getByRole("option", { name: value }));
      await waitFor(() =>
        expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"),
      );
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Filter applications" }),
        ).not.toBeInTheDocument(),
      );
      const titles = screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
      expect(titles).toEqual(expected);
      expect(screen.getByRole("status")).toHaveTextContent(`${expected.length} of 7 applications`);
      await user.click(screen.getByRole("button", { name: `Remove filter: ${value}` }));
      expect(screen.getByRole("status")).toHaveTextContent("7 of 7 applications");
    }
  });

  it("combines round, search, and work-state filters and clears them while preserving sorting", async () => {
    const user = userEvent.setup();
    render(<OverviewHarness />, { wrapper: GrantmakingMessagesProvider });

    expect(screen.getByRole("status")).toHaveTextContent("7 of 7 applications");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Application" }));
    await user.click(screen.getByRole("button", { name: "Application" }));
    expect(screen.getByRole("button", { name: "Application" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Evidence Any" }));
    await user.click(screen.getByRole("option", { name: "Changed evidence or criteria" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
    await user.click(screen.getByRole("button", { name: "Participation Any" }));
    await user.click(screen.getByRole("option", { name: "Active" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 of 7 applications");

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Round All rounds" }));
    await user.click(screen.getByRole("option", { name: "Local Connections 2027" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 of 7 applications");

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "  meadow  ");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 of 7 applications");
    expect(screen.getByRole("row", { name: /Criteria changed project/ })).toBeVisible();

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("searchbox", { name: "Search applications" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Round All rounds" })).toBeVisible();
    for (const criterion of [
      "Participation",
      "Readiness",
      "Reviews",
      "Evidence",
      "Recommendation",
    ]) {
      expect(screen.getByRole("button", { name: `${criterion} Any` })).toBeVisible();
    }
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("7 of 7 applications");
    expect(screen.getByRole("button", { name: "Application" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("distinguishes no-matches, empty-round, and empty-workspace table messages", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OverviewHarness />, { wrapper: GrantmakingMessagesProvider });

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Round All rounds" }));
    await user.click(screen.getByRole("option", { name: "Empty round" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );

    expect(screen.getByText("No applications in this round yet.")).toBeVisible();
    expect(screen.getByText("0 of 7 applications")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Remove filter: Empty round" })).toBeVisible();

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "missing");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );

    expect(screen.getByText("No applications match your search and filter.")).toBeVisible();

    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Reviews Any" }));
    await user.click(screen.getByRole("option", { name: "Awaiting reviews" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "harbour");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );

    expect(screen.getByText("No applications match your search and filter.")).toBeVisible();

    rerender(<OverviewHarness applications={[]} />);
    if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
    }
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("No applications in this workspace yet.")).toBeVisible();
    expect(screen.getByText("0 of 0 applications")).toHaveAttribute("role", "status");
  });

  it("shows and sorts the withdrawn state rather than the status the application retains", async () => {
    const user = userEvent.setup();
    render(<OverviewHarness />, { wrapper: GrantmakingMessagesProvider });

    const order = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[3]?.textContent);

    expect(screen.getByRole("row", { name: /Withdrawn project/ })).toHaveTextContent("Withdrawn");
    await user.click(screen.getByRole("button", { name: "Intake" }));

    // Labels sort as In preparation, Ready, Withdrawn.
    expect(order()[0]).toContain("In preparation");
    expect(order().at(-1)).toContain("Withdrawn");
  });
});

it("moves focus to the table start only when a successful page change still owns focus", async () => {
  const user = userEvent.setup();

  const next = () => undefined;

  const view = (offset: number, loading = false, failed = false) => (
    <>
      <button>Another control</button>
      <ApplicationsOverview
        applications={overviewFixtures}
        rounds={rounds}
        roundId=""
        onRoundChange={() => {}}
        sorting={null}
        onSortingChange={() => {}}
        renderApplicationLink={(item) => item.title}
        renderRoundLink={(item) => item.roundTitle}
        pagination={{
          total: 107,
          matching: 107,
          offset,
          loading,
          failed,
          onPrevious: next,
          onNext: next,
          onRetry: next,
        }}
      />
    </>
  );

  const { rerender } = render(view(0), { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(view(0, true));
  rerender(view(50));
  expect(screen.getByRole("group", { name: "Applications" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(view(50, true));
  await user.click(screen.getByRole("button", { name: "Another control" }));
  rerender(view(100));
  expect(screen.getByRole("button", { name: "Another control" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  rerender(view(100, false, true));
  expect(screen.getByRole("button", { name: "Previous" })).toHaveFocus();
});
