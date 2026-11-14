import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import type { TableSort } from "@merit/tables";

import { GrantmakingMessagesProvider } from "../../messages";
import { applicationFilters, ApplicationsOverview, type ApplicationFilter } from "../../rounds";

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
  reviews: { current: 1, outdated: 0, outstanding: 0, unknown: 0 },
  criteriaChanged: false,
  recommendation: { position: "Fund", outdated: false },
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
    recommendation: { position: "Defer", outdated: true },
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

    const expectedByFilter: Record<ApplicationFilter, string[]> = {
      all: overviewFixtures.map((item) => item.title),
      // Withdrawn applications appear only under All and their own filter.
      withdrawn: ["Withdrawn project"],
      preparing: ["Preparing project"],
      awaiting: ["Awaiting project"],
      unassigned: ["Preparing project"],
      changed: [
        "Outdated review project",
        "Criteria changed project",
        "Outdated recommendation project",
      ],
      unknown: ["Unknown review basis project"],
      unwritten: ["Preparing project"],
    };

    const filterLabels: Record<ApplicationFilter, string> = {
      all: "All applications",
      preparing: "In preparation",
      awaiting: "Awaiting reviews",
      unassigned: "No reviewers assigned",
      changed: "Changed evidence or criteria",
      unknown: "Review basis not known",
      unwritten: "No recommendation",
      withdrawn: "Withdrawn",
    };

    for (const filter of applicationFilters) {
      await user.click(screen.getByRole("button", { name: /Show/ }));
      await user.click(screen.getByRole("option", { name: filterLabels[filter] }));

      const titles = screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

      expect(titles).toEqual(expectedByFilter[filter]);
      expect(screen.getByRole("status")).toHaveTextContent(
        `${expectedByFilter[filter].length} of ${overviewFixtures.length} applications`,
      );
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

    await user.click(screen.getByRole("button", { name: /Show/ }));
    await user.click(screen.getByRole("option", { name: "Changed evidence or criteria" }));
    expect(screen.getByRole("status")).toHaveTextContent("3 of 7 applications");

    await user.click(screen.getByRole("button", { name: "All rounds Round" }));
    await user.click(screen.getByRole("option", { name: "Local Connections 2027" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 of 7 applications");

    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "  meadow  ");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 7 applications");
    expect(screen.getByRole("row", { name: /Criteria changed project/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("status")).toHaveTextContent("7 of 7 applications");
    expect(screen.getByRole("searchbox", { name: "Search applications" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "All rounds Round" })).toBeVisible();
    expect(screen.getByRole("button", { name: "All applications Show" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Application" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("distinguishes no-matches, empty-round, and empty-workspace table messages", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OverviewHarness />, { wrapper: GrantmakingMessagesProvider });

    await user.click(screen.getByRole("button", { name: "All rounds Round" }));
    await user.click(screen.getByRole("option", { name: "Empty round" }));

    expect(screen.getByText("No applications in this round yet.")).toBeVisible();
    expect(screen.getByText("0 of 7 applications")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "missing");

    expect(screen.getByText("No applications match your search and filter.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.click(screen.getByRole("button", { name: /Show/ }));
    await user.click(screen.getByRole("option", { name: "Awaiting reviews" }));
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "harbour");

    expect(screen.getByText("No applications match your search and filter.")).toBeVisible();

    rerender(<OverviewHarness applications={[]} />);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

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
