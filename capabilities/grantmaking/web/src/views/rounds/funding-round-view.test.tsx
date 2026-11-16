import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, describe, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { roundView } from "@merit/grantmaking/api";
import {
  makeApplication,
  makeAssessment,
  makeReviewRequest,
  makeReviewedApplication,
  makeRound,
} from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundPreview as FundingRoundView } from "../../testing/application-list-preview";

// The list owns its three states: current reviews, a conditional proposal, and revised material.
const makeRoundWithReviewStates = () =>
  roundView(
    makeRound({
      purpose: "Support local activities.",
      manager: "Dana Reed",
      meetingDate: "2027-01-21",
      budget: fromMinorUnits(6000000n),
      decisionStatus: "Decisions pending",
      applications: [
        {
          ...makeReviewedApplication(),
          id: "first",
          title: "Neighbour Table",
          requested: fromMinorUnits(2400000n),
          managerRecommendation: {
            position: "Fund",
            allocation: fromMinorUnits(2400000n),
            reasoning: "Support the meals.",
          },
        },
        {
          ...makeReviewedApplication(),
          id: "second",
          title: "Ride Together",
          requested: fromMinorUnits(2800000n),
          managerRecommendation: {
            position: "Fund with a condition",
            allocation: fromMinorUnits(2800000n),
            reasoning: "Confirm the provider.",
          },
        },
        makeApplication({
          id: "third",
          title: "Workshop Saturdays",
          version: 2,
          requested: fromMinorUnits(2200000n),
          submission: { version: 2, organization: "Repair Collective", answers: [] },
          attention: ["Updated budget needs review", "Written provider confirmation missing"],
          managerRecommendation: {
            position: "Defer",
            allocation: fromMinorUnits(0n),
            reasoning: "Await the revised assessment.",
          },
          reviews: {
            revision: 2,
            assessments: [makeAssessment()],
            requests: [
              makeReviewRequest({
                id: "pending",
                contactId: "jules",
                reviewer: "Jules",
                applicationVersion: 2,
              }),
            ],
          },
        }),
      ],
    }),
  );

describe("funding round overview", () => {
  it("keeps round properties available beside both sections", async () => {
    const user = userEvent.setup();
    render(<FundingRoundView round={makeRoundWithReviewStates()} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    const properties = screen.getByRole("complementary", { name: "Round properties" });

    expect(properties).toBeVisible();
    expect(within(properties).getByText("21 January 2027")).toBeVisible();
    expect(within(properties).getByText("Dana Reed")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(properties).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Applications/ }));

    expect(properties).toBeVisible();
    expect(within(properties).getByRole("region", { name: "Round summary" })).toBeVisible();
    expect(screen.getByText("Decisions pending")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.getByRole("complementary", { name: "Round properties" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Round summary" })).not.toBeInTheDocument();
  });

  it("sorts exact allocations, keeps missing recommendations last, and retains sorting across tabs", async () => {
    const user = userEvent.setup();
    const round = makeRoundWithReviewStates();
    const [first, second, third] = round.applications;

    assert.isDefined(first);
    assert.isDefined(second);
    assert.isDefined(third);

    first.managerRecommendation!.allocation = fromMinorUnits(0n);
    second.managerRecommendation!.allocation = fromMinorUnits(9007199254740993n);
    third.managerRecommendation!.allocation = fromMinorUnits(9007199254740992n);
    round.applications.push({
      ...first,
      id: "missing",
      title: "Unwritten recommendation",
      managerRecommendation: null,
    });
    render(<FundingRoundView round={roundView(round)} section="applications" />, {
      wrapper: GrantmakingMessagesProvider,
    });

    const order = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

    const proposed = screen.getByRole("button", { name: "Proposed" });
    await user.click(proposed);

    expect(order()).toEqual([
      expect.stringContaining(first.title),
      expect.stringContaining(third.title),
      expect.stringContaining(second.title),
      expect.stringContaining("Unwritten recommendation"),
    ]);

    await user.click(proposed);

    expect(order()).toEqual([
      expect.stringContaining(second.title),
      expect.stringContaining(third.title),
      expect.stringContaining(first.title),
      expect.stringContaining("Unwritten recommendation"),
    ]);

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(screen.getByRole("tab", { name: /Applications/ }));

    expect(order()[0]).toContain(second.title);
    expect(screen.getByRole("button", { name: "Proposed" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    await user.click(screen.getByRole("button", { name: "Proposed" }));

    expect(order()).toEqual([
      expect.stringContaining(first.title),
      expect.stringContaining(second.title),
      expect.stringContaining(third.title),
      expect.stringContaining("Unwritten recommendation"),
    ]);
  });

  it("distinguishes outdated and awaiting reviews without presenting static concerns as live status", () => {
    render(<FundingRoundView round={makeRoundWithReviewStates()} section="applications" />, {
      wrapper: GrantmakingMessagesProvider,
    });

    const summary = within(screen.getByRole("complementary", { name: "Round properties" }));
    expect(summary.getByText("5 of 6 reviewed")).toBeVisible();
    expect(summary.getByRole("button", { name: "Review details for this round" })).toBeVisible();

    const workshop = within(screen.getByRole("row", { name: /Workshop Saturdays/ }));

    expect(workshop.getByText("1 of 2 reviewed")).toBeVisible();
    expect(
      workshop.getByRole("button", { name: "Review details for Workshop Saturdays" }),
    ).toBeVisible();
    expect(screen.queryByText("Updated budget needs review")).not.toBeInTheDocument();
    expect(screen.queryByText("Written provider confirmation missing")).not.toBeInTheDocument();
  });

  it("separates round context from the application working view using keyboard-accessible tabs", async () => {
    const user = userEvent.setup();
    const round = makeRoundWithReviewStates();
    render(<FundingRoundView round={round} />, { wrapper: GrantmakingMessagesProvider });

    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Round summary" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.queryByRole("table", { name: "Applications" })).not.toBeInTheDocument();
    expect(screen.getByText(round.purpose)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assessment criteria" })).toBeVisible();
    expect(screen.getByText("€60,000")).toBeVisible();
    expect(screen.getByText("21 January 2027")).toBeVisible();
    expect(
      within(screen.getByRole("complementary", { name: "Round properties" })).getByText(
        round.manager,
      ),
    ).toBeVisible();

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("table", { name: "Applications" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Round summary" })).toHaveTextContent(
      "Remaining if approved€8,000",
    );
    expect(screen.queryByText(round.purpose)).not.toBeInTheDocument();
  });

  it("distinguishes having no reviewers assigned from having current reviews", () => {
    const round = makeRoundWithReviewStates();

    assert.isDefined(round.applications[0]);

    round.applications[0].reviews = {
      revision: reviewRevisionSchema.parse(0),
      requests: [],
      assessments: [],
    };
    render(<FundingRoundView round={roundView(round)} section="applications" />, {
      wrapper: GrantmakingMessagesProvider,
    });

    const unassigned = within(screen.getByRole("row", { name: /Neighbour Table/ }));

    expect(unassigned.getByText("None assigned")).toBeVisible();
    expect(unassigned.queryByText(/current/)).not.toBeInTheDocument();

    const reviewed = within(screen.getByRole("row", { name: /Ride Together/ }));

    expect(reviewed.getByText("2 of 2 reviewed")).toBeVisible();
  });

  it("keeps an absent manager recommendation distinct from a deferral", () => {
    const round = makeRoundWithReviewStates();

    assert.isDefined(round.applications[0]);

    round.applications[0].managerRecommendation = null;
    render(<FundingRoundView round={roundView(round)} section="applications" />, {
      wrapper: GrantmakingMessagesProvider,
    });

    const unwritten = within(screen.getByRole("row", { name: /Neighbour Table/ }));

    expect(unwritten.getByText("Not yet recommended")).toBeVisible();
    expect(unwritten.getByText("—")).toBeVisible();
    expect(unwritten.queryByText("Defer")).not.toBeInTheDocument();
    expect(unwritten.queryByText("No funding proposed")).not.toBeInTheDocument();

    const deferred = within(screen.getByRole("row", { name: /Workshop Saturdays/ }));

    expect(deferred.getByText("Defer")).toBeVisible();
    expect(deferred.getByText("€0")).toBeVisible();
    expect(deferred.queryByText("No funding proposed")).not.toBeInTheDocument();
  });
});

it("qualifies known requests and explains unknown amounts beside the total", async () => {
  const user = userEvent.setup();
  const round = { ...makeRoundWithReviewStates(), budget: null };

  assert.isDefined(round.applications[0]);

  round.applications[0].requested = null;

  assert.isDefined(round.applications[1]);

  round.applications[1].requested = fromMinorUnits(0n);
  render(<FundingRoundView round={roundView(round)} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const summary = within(screen.getByRole("region", { name: "Round summary" }));

  expect(summary.getByText("Known requests")).toBeVisible();
  expect(summary.getByText("€22,000")).toBeVisible();
  expect(summary.queryByText("1 requested amount is not known.")).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("complementary", { name: "Round properties" })).getByText("Not set"),
  ).toBeVisible();
  expect(summary.getByText("Budget not set")).toBeVisible();
  expect(
    within(screen.getByRole("row", { name: /Neighbour Table/ })).getByLabelText(
      "Requested amount not known",
    ),
  ).toBeVisible();
  expect(within(screen.getByRole("row", { name: /Ride Together/ })).getByText("€0")).toBeVisible();
  await user.click(summary.getByRole("button", { name: "Unknown requested amounts" }));
  expect(screen.getByRole("dialog", { name: "Unknown requested amounts" })).toHaveTextContent(
    "1 requested amount is not known.",
  );
});

it("combines applicant search and review filters without changing whole-round totals", async () => {
  const user = userEvent.setup();
  render(<FundingRoundView round={makeRoundWithReviewStates()} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const summary = screen.getByRole("region", { name: "Round summary" });
  const originalSummary = summary.textContent;
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "  REPAIR  ");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );

  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /Neighbour Table/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 of 3 applications");

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

  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();

  if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
    await user.click(screen.getByRole("button", { name: "Filter" }));
  }
  await user.click(screen.getByRole("button", { name: "Recommendation Any" }));
  await user.click(screen.getByRole("option", { name: "No recommendation" }));
  await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );

  expect(screen.getByText("No applications match your search and filter.")).toBeVisible();
  expect(summary.textContent).toBe(originalSummary);

  if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
    await user.click(screen.getByRole("button", { name: "Filter" }));
  }
  await user.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(screen.getByRole("searchbox")).toHaveValue("");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );
  expect(screen.getAllByRole("row")).toHaveLength(4);
});

const withdrawal = {
  withdrawnOn: "2027-01-10",
  reason: "The applicant found other funding.",
  recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
};

const makeRoundWithWithdrawal = () => {
  const round = makeRoundWithReviewStates();
  return roundView({
    ...round,
    applications: [
      ...round.applications,
      {
        ...makeReviewedApplication(),
        id: "fourth",
        title: "Garden Share",
        withdrawal,
        requested: fromMinorUnits(9000000n),
        managerRecommendation: {
          position: "Fund",
          allocation: fromMinorUnits(9000000n),
          reasoning: "Withdrawn since.",
        },
        reviews: {
          revision: reviewRevisionSchema.parse(1),
          assessments: [],
          requests: [makeReviewRequest({ id: "closed", contactId: "sam", reviewer: "Sam" })],
        },
      },
    ],
  });
};

it("labels withdrawn applications and explains exclusions through whole-round scope", async () => {
  const user = userEvent.setup();
  const without = render(
    <FundingRoundView round={makeRoundWithReviewStates()} section="applications" />,
    {
      wrapper: GrantmakingMessagesProvider,
    },
  );
  expect(screen.queryByText(/withdrawn application/)).not.toBeInTheDocument();
  expect(screen.queryByRole("row", { name: /Withdrawn/ })).not.toBeInTheDocument();
  const unchanged = screen.getByRole("region", { name: "Round summary" }).textContent;
  without.unmount();

  const round = makeRoundWithWithdrawal();
  render(<FundingRoundView round={round} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const summary = screen.getByRole("region", { name: "Round summary" });

  expect(
    within(summary).queryByText("1 withdrawn application not counted."),
  ).not.toBeInTheDocument();
  expect(summary.textContent).toBe(unchanged);
  expect(
    within(screen.getByRole("row", { name: /Garden Share/ })).getByText("Withdrawn"),
  ).toBeVisible();
  expect(
    within(screen.getByRole("row", { name: /Neighbour Table/ })).queryByText("Withdrawn"),
  ).not.toBeInTheDocument();
  await user.click(within(summary).getByRole("button", { name: "Round totals scope" }));
  const explanation = screen.getByRole("dialog", { name: "Round totals scope" });
  expect(explanation).toHaveTextContent(
    "Totals cover the whole round, regardless of the application filters.",
  );
  expect(explanation).toHaveTextContent("1 withdrawn application not counted.");
});

it("combines participation and review criteria without implicitly excluding withdrawn applications", async () => {
  const user = userEvent.setup();
  render(<FundingRoundView round={makeRoundWithWithdrawal()} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });

  expect(screen.getByRole("row", { name: /Garden Share/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Reviews Any" }));
  await user.click(screen.getByRole("option", { name: "Awaiting reviews" }));
  await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("row", { name: /Garden Share/ })).toBeVisible();
  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Participation Any" }));
  await user.click(screen.getByRole("option", { name: "Active" }));
  await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("row", { name: /Garden Share/ })).not.toBeInTheDocument();
  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Participation Active" }));
  await user.click(screen.getByRole("option", { name: "Withdrawn" }));
  await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-haspopup", "listbox"));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 applications");
  expect(screen.getByRole("row", { name: /Garden Share/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /Workshop Saturdays/ })).not.toBeInTheDocument();

  // Sorting still works across the mixed list.
  if (!screen.queryByRole("dialog", { name: "Filter applications" })) {
    await user.click(screen.getByRole("button", { name: "Filter" }));
  }
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filter applications" })).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Requested" }));
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows).toHaveLength(4);
  expect(within(rows[0]!).getByText("Workshop Saturdays")).toBeVisible();
  expect(screen.getByRole("row", { name: /Garden Share/ })).toBeVisible();
});

it("sorts requested amounts exactly and keeps unknown amounts last in both directions", async () => {
  const user = userEvent.setup();
  const round = makeRoundWithReviewStates();

  assert.isDefined(round.applications[0]);

  round.applications[0].requested = null;

  assert.isDefined(round.applications[1]);

  round.applications[1].requested = fromMinorUnits(9007199254740993n);

  assert.isDefined(round.applications[2]);

  round.applications[2].requested = fromMinorUnits(9007199254740992n);
  render(<FundingRoundView round={roundView(round)} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: "Requested" }));

  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Workshop Saturdays");
  expect(screen.getAllByRole("row")[3]).toHaveTextContent("Neighbour Table");

  await user.click(screen.getByRole("button", { name: "Requested" }));

  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Ride Together");
  expect(screen.getAllByRole("row")[3]).toHaveTextContent("Neighbour Table");
});

it.each([
  ["Dana Reed", false, "Dana Reed", false],
  ["Samira Patel", true, "Samira Patel", true],
  ["  ", true, "Unassigned", false],
  ["  ", false, "Name not recorded", false],
])(
  "keeps manager identity and assignment states explicit in round properties",
  (manager, managerNeedsReassignment, label, warning) => {
    const round = { ...makeRoundWithReviewStates(), manager, managerNeedsReassignment };
    render(<FundingRoundView round={round} />, { wrapper: GrantmakingMessagesProvider });
    const properties = within(screen.getByRole("complementary", { name: "Round properties" }));
    expect(properties.getByText(label)).toBeVisible();
    expect(Boolean(properties.queryByRole("button", { name: "Reassignment needed" }))).toBe(
      warning,
    );
  },
);

it("keeps excess allocations visible and explains their draft status beside the affected fact", async () => {
  const user = userEvent.setup();
  const round = makeRoundWithReviewStates();
  round.budget = fromMinorUnits(5000000n);
  render(<FundingRoundView round={roundView(round)} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const summary = within(screen.getByRole("region", { name: "Round summary" }));
  expect(summary.getByText("Over budget if approved")).toBeVisible();
  expect(summary.getByText("€2,000")).toBeVisible();
  expect(summary.queryByText(/These are draft recommendations/)).not.toBeInTheDocument();
  const warning = summary.getByRole("button", { name: "Over budget" });
  expect(warning.closest("dd")).toHaveTextContent("€2,000");
  await user.click(warning);
  expect(screen.getByRole("dialog", { name: "Over budget" })).toHaveTextContent(
    "Proposed allocations exceed the round budget by €2,000. These are draft recommendations, not funding commitments.",
  );
});

it("keeps an earlier recommendation warning separate from review progress", async () => {
  const user = userEvent.setup();
  const round = makeRoundWithReviewStates();
  const first = round.applications[0]!;
  first.version = materialVersionSchema.parse(2);
  first.managerRecommendation!.recorded = { applicationVersion: 1, date: "2027-01-10" };
  render(<FundingRoundView round={round} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const cells = within(screen.getByRole("row", { name: /Neighbour Table/ })).getAllByRole("cell");
  const warning = within(cells[2]!).getByRole("button", {
    name: "Recommendation uses an earlier version",
  });
  expect(
    within(cells[1]!).queryByRole("button", { name: "Recommendation uses an earlier version" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Earlier version")).not.toBeInTheDocument();
  await user.click(warning);
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "This recommendation was recorded for an earlier application version.",
  );
});
