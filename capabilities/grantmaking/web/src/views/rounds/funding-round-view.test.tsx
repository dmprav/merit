import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, describe, expect, it } from "vite-plus/test";

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
import { FundingRoundView } from "./funding-round-view";

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
    expect(screen.getByText("Decisions pending")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.getByRole("complementary", { name: "Round properties" })).toBeVisible();
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

    expect(
      screen.getByText("4 current reviews, 1 outdated review, 1 awaiting review"),
    ).toBeVisible();

    const workshop = within(screen.getByRole("row", { name: /Workshop Saturdays/ }));

    expect(workshop.getByText("1 outdated review, 1 awaiting review")).toBeVisible();
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

    expect(unassigned.getByText("No reviewers assigned.")).toBeVisible();
    expect(unassigned.queryByText(/current/)).not.toBeInTheDocument();

    const reviewed = within(screen.getByRole("row", { name: /Ride Together/ }));

    expect(reviewed.getByText("2 current reviews")).toBeVisible();
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

it("distinguishes unknown requests and an unset budget from confirmed zero amounts", () => {
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
  expect(summary.getByText("1 requested amount is not known.")).toBeVisible();
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
});

it("combines applicant search and review filters without changing whole-round totals", async () => {
  const user = userEvent.setup();
  render(<FundingRoundView round={makeRoundWithReviewStates()} section="applications" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const summary = screen.getByRole("region", { name: "Round summary" });
  const originalSummary = summary.textContent;
  await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "  REPAIR  ");

  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /Neighbour Table/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 of 3 applications");

  await user.click(screen.getByRole("button", { name: /Show/ }));
  await user.click(screen.getByRole("option", { name: "Awaiting reviews" }));

  expect(screen.getByRole("row", { name: /Workshop Saturdays/ })).toBeVisible();

  await user.click(screen.getByRole("button", { name: /Show/ }));
  await user.click(screen.getByRole("option", { name: "No recommendation" }));

  expect(screen.getByText("No applications match your search and filter.")).toBeVisible();
  expect(summary.textContent).toBe(originalSummary);

  await user.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(screen.getAllByRole("row")).toHaveLength(4);
  expect(screen.getByRole("searchbox")).toHaveValue("");
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
