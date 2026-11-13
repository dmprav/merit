import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeApplicationDetail, applicationView, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationHistory } from "./application-history";
import type { ApplicationHistoryEntry } from "./application-history-model";

const round = roundView(makeRound());
const original = applicationView(makeApplication());

const application = (
  version: number,
): typeof original & { submission: NonNullable<typeof original.submission> } => ({
  ...original,
  version: materialVersionSchema.parse(version),
  submission: {
    ...original.submission!,
    version,
    answers: [
      {
        questionId: "0c624d85-b955-5e5f-a53e-f124c33b7c1b",
        question: "Project overview",
        response: "We bring neighbours together.",
      },
      {
        questionId: "d9a76bac-b7fa-5995-a7a3-60495c376bc6",
        question: "Delivery plan",
        response: `Delivery arrangements ${version}.`,
      },
    ],
  },
});

const entry = (from: number, to: number): ApplicationHistoryEntry => ({
  revision: to,
  action: "application.revision_recorded",
  actor: "Dana Reed",
  provenance: { interface: "web" },
  reason: `Reason for version ${to}.`,
  recordedAt: "2027-01-19T11:00:00Z",
  before: encodeApplicationDetail({ round, application: application(from) }).application,
  after: encodeApplicationDetail({ round, application: application(to) }).application,
});

const renderComparison = (before: typeof original, after: typeof original) =>
  render(
    <ApplicationHistory
      application={after}
      history={[
        {
          ...entry(before.version, after.version),
          before: encodeApplicationDetail({ round, application: before }).application,
          after: encodeApplicationDetail({ round, application: after }).application,
        },
      ]}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

const section = (heading: string) =>
  within(screen.getByRole("heading", { name: heading }).closest("section")!);

describe("application history comparison", () => {
  it("formats both snapshots consistently and keeps missing facts distinct from empty text", () => {
    const before = application(1);
    const after = application(2);
    renderComparison(
      {
        ...before,
        title: "Earlier title",
        submission: {
          ...before.submission,
          organization: "Earlier applicant",
          contact: "Sam Morgan",
          contactEmail: "sam@example.test",
          projectPeriod: "Spring 2027",
          submittedOn: "2027-01-19",
        },
      },
      {
        ...after,
        title: "Current title",
        requested: fromMinorUnits(125050n),
        submission: {
          ...after.submission,
          organization: "Current applicant",
          contact: "Leah Martin",
          projectPeriod: "",
          submittedOn: "2027-01-20",
        },
      },
    );

    for (const [heading, previous, current] of [
      ["Application title", "Earlier title", "Current title"],
      ["Applicant", "Earlier applicant", "Current applicant"],
      ["Requested funding", "Not recorded", "€1,250.50"],
      ["Contact", "Sam Morgan", "Leah Martin"],
      ["Contact email", "sam@example.test", "Not recorded"],
      ["Submitted", "19 January 2027", "20 January 2027"],
    ] as const) {
      expect(section(heading).getByText("Version 1").parentElement).toHaveTextContent(previous);
      expect(section(heading).getByText("Version 2 (current)").parentElement).toHaveTextContent(
        current,
      );
    }
    expect(section("Project period").getByText("Version 1").parentElement).toHaveTextContent(
      "Spring 2027",
    );
    expect(
      section("Project period").getByText("Version 2 (current)").parentElement?.querySelector("p"),
    ).toBeEmptyDOMElement();
  });

  it.each(["Plan", ""])(
    "matches duplicate or blank headings by stable identity: %s",
    (question) => {
      const before = application(1);
      const after = application(2);
      before.submission!.answers = [
        {
          questionId: "10000000-0000-4000-8000-000000000001",
          question,
          response: "First old answer.",
        },
        {
          questionId: "10000000-0000-4000-8000-000000000002",
          question,
          response: "Second old answer.",
        },
      ];
      after.submission!.answers = [
        {
          questionId: "10000000-0000-4000-8000-000000000001",
          question,
          response: "First new answer.",
        },
        {
          questionId: "10000000-0000-4000-8000-000000000002",
          question,
          response: "Second new answer.",
        },
      ];
      renderComparison(before, after);

      expect(screen.getAllByRole("heading", { name: question || "Untitled section" })).toHaveLength(
        2,
      );
      for (const answer of [
        "First old answer.",
        "Second old answer.",
        "First new answer.",
        "Second new answer.",
      ]) {
        expect(screen.getByText(answer)).toBeInTheDocument();
      }
      expect(screen.queryByText("Added")).not.toBeInTheDocument();
      expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    },
  );

  it("keeps reordered, changed, added, and removed sections beside their correct versions", () => {
    const before = application(1);
    const after = application(2);
    before.submission!.answers = [
      {
        questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
        question: "Purpose",
        response: "Bring neighbours together.",
      },
      {
        questionId: "934b7d5b-253c-5308-8a6a-2cd276004967",
        question: "Budget",
        response: "Original costs.",
      },
      {
        questionId: "5a90f97d-c0a5-5f59-b616-dfefd403c0f8",
        question: "Old venue",
        response: "The former venue.",
      },
    ];
    after.submission!.answers = [
      {
        questionId: "934b7d5b-253c-5308-8a6a-2cd276004967",
        question: "Budget",
        response: "Updated costs.",
      },
      {
        questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
        question: "Purpose",
        response: "Bring neighbours together.",
      },
      {
        questionId: "08009ae1-cc41-5d9e-ac9e-6e07e72ae6ba",
        question: "Access",
        response: "Step-free entrance.",
      },
    ];
    renderComparison(before, after);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Version 1 → Version 2",
      "Requested funding",
      "Budget",
      "Purpose",
      "Access",
      "Old venue",
    ]);
    expect(section("Budget").getByText("Version 1").parentElement).toHaveTextContent(
      "Original costs.",
    );
    expect(section("Budget").getByText("Version 2 (current)").parentElement).toHaveTextContent(
      "Updated costs.",
    );
    expect(section("Purpose").getByText("Unchanged")).toBeVisible();
    expect(section("Purpose").getAllByText("Bring neighbours together.")).toHaveLength(1);
    expect(section("Purpose").queryByText("Version 1")).not.toBeInTheDocument();
    expect(section("Access").getByText("Added")).toBeVisible();
    expect(section("Access").getByText("Version 1").parentElement).toHaveTextContent(
      "Not present in this version",
    );
    expect(section("Access").getByText("Version 2 (current)").parentElement).toHaveTextContent(
      "Step-free entrance.",
    );
    expect(section("Old venue").getByText("Removed")).toBeVisible();
    expect(section("Old venue").getByText("Version 1").parentElement).toHaveTextContent(
      "The former venue.",
    );
    expect(section("Old venue").getByText("Version 2 (current)").parentElement).toHaveTextContent(
      "Not present in this version",
    );
  });

  it.each([
    { missing: "earlier", beforePresent: false, afterPresent: true },
    { missing: "current", beforePresent: true, afterPresent: false },
    { missing: "both", beforePresent: false, afterPresent: false },
  ])(
    "shows missing $missing material without treating its sections as additions or removals",
    ({ beforePresent, afterPresent }) => {
      const before = application(1);
      const after = application(2);
      renderComparison(
        { ...before, submission: beforePresent ? before.submission : undefined },
        {
          ...after,
          requested: fromMinorUnits(0n),
          submission: afterPresent ? after.submission : undefined,
        },
      );

      expect(
        screen.getByText("Submitted material was not recorded for this version."),
      ).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Project overview" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Delivery plan" })).not.toBeInTheDocument();
      expect(screen.queryByText("Added")).not.toBeInTheDocument();
      expect(screen.queryByText("Removed")).not.toBeInTheDocument();
      expect(section("Requested funding").getByText("Version 1").parentElement).toHaveTextContent(
        "Not recorded",
      );
      expect(
        section("Requested funding").getByText("Version 2 (current)").parentElement,
      ).toHaveTextContent("€0");
    },
  );

  it("treats recorded empty submissions as available material", () => {
    const before = application(1);
    const after = application(2);
    before.submission!.answers = [];
    after.submission!.answers = [];
    renderComparison(before, after);

    expect(
      screen.queryByText("Submitted material was not recorded for this version."),
    ).not.toBeInTheDocument();
    expect(section("Requested funding").getByText("Unchanged")).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("starts with the latest pair and allows nonadjacent comparisons without misattributing reasons", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationHistory application={application(3)} history={[entry(1, 2), entry(2, 3)]} />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.getByRole("button", { name: /Compare from/ })).toHaveTextContent("Version 2");
    expect(screen.getByRole("button", { name: /Compare to/ })).toHaveTextContent(
      "Version 3 (current)",
    );
    expect(screen.queryByText("Reason for version 2.")).not.toBeInTheDocument();
    expect(screen.getByText("We bring neighbours together.")).toBeVisible();
    expect(screen.getAllByText("Unchanged")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Compare from/ }));
    await user.click(screen.getByRole("option", { name: "Version 1" }));

    expect(screen.getByText("Reason for version 2.")).toBeVisible();
    expect(screen.getByText("Reason for version 3.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Compare to/ }));
    await user.click(screen.getByRole("option", { name: "Version 2" }));

    expect(screen.queryByText("Reason for version 3.")).not.toBeInTheDocument();
    expect(screen.queryByText("Version 2 (current)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Compare from/ }));
    await user.click(screen.getByRole("option", { name: "Version 2" }));

    expect(screen.getByRole("button", { name: /Compare to/ })).toHaveTextContent(
      "Version 3 (current)",
    );
  });

  it("preserves an unavailable reviewed basis until the person chooses a recorded version", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationHistory
        application={application(3)}
        history={[entry(2, 3)]}
        initialFromVersion={1}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(
      screen.getByText(
        "Version 1 is not available for comparison. Choose another recorded version.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Delivery arrangements 2.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Compare from/ }));
    await user.click(screen.getByRole("option", { name: "Version 2" }));

    expect(screen.getByText("Delivery arrangements 2.")).toBeVisible();
  });

  it("does not offer a fabricated earlier version for records without history", () => {
    render(<ApplicationHistory application={application(3)} history={[]} />, {
      wrapper: GrantmakingMessagesProvider,
    });

    expect(
      screen.getByText("An earlier submission is not available for comparison."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Compare from/ })).not.toBeInTheDocument();
  });
});

it("shows both headings when an identified question is renamed without changing its answer", () => {
  const questionId = "10000000-0000-4000-8000-000000000001";
  const before = application(1);
  const after = application(2);
  before.submission!.answers = [{ questionId, question: "Old heading", response: "Same response" }];
  after.submission!.answers = [{ questionId, question: "New heading", response: "Same response" }];
  renderComparison(before, after);
  const changed = section("New heading");
  expect(changed.getByText("Old heading")).toBeVisible();
  expect(changed.getAllByText("Same response")).toHaveLength(2);
  expect(changed.queryByText("Unchanged")).not.toBeInTheDocument();
  expect(changed.queryByText("Added")).not.toBeInTheDocument();
});
