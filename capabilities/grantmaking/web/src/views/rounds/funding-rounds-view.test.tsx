import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import type { RoundSummary } from "@merit/grantmaking/api";
import { fromMinorUnits } from "@merit/money";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundsView } from "./funding-rounds-view";

const makeSummary = (overrides: Partial<RoundSummary> = {}): RoundSummary => ({
  organizationId: "alder",
  organizationName: "Alder Foundation",
  workspaceSlug: "alder",
  publicId: "k7m2p9x4n6rt",
  title: "Spring grants",
  decisionStatus: "Preparing",
  manager: "Dana Reed",
  managerNeedsReassignment: false,
  applicationCount: 3,
  meetingDate: "2027-04-15",
  budget: fromMinorUnits(6000000n),
  ...overrides,
});

const renderRounds = (rounds: readonly RoundSummary[]) =>
  render(
    <FundingRoundsView
      rounds={rounds}
      renderRoundLink={(round) => (
        <a href={`/app/${round.workspaceSlug}/rounds/${round.publicId}`}>{round.title}</a>
      )}
      renderApplicationsLink={(round, children) => (
        <a href={`/app/${round.workspaceSlug}/rounds/${round.publicId}?section=applications`}>
          {children}
        </a>
      )}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

describe("funding rounds list", () => {
  it("places Responsible manager between Status and Applications without sorting", () => {
    renderRounds([makeSummary()]);

    const table = screen.getByRole("table", { name: "Funding rounds" });
    const headers = within(table).getAllByRole("columnheader");

    expect(headers.map((header) => header.firstElementChild?.textContent?.trim())).toEqual([
      "Round",
      "Status",
      "Responsible manager",
      "Applications",
      "Committee date",
      "Budget",
    ]);
    expect(within(headers[2]!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders all four responsible manager states from trimmed name and reassignment status", () => {
    renderRounds([
      makeSummary({
        publicId: "b8q3w5j7c2df",
        title: "Active manager round",
        manager: "  Dana Reed  ",
        managerNeedsReassignment: false,
      }),
      makeSummary({
        publicId: "c7m2p9x4n6rt",
        title: "Former manager round",
        manager: "Samira Patel",
        managerNeedsReassignment: true,
      }),
      makeSummary({
        publicId: "h7m2p9x4n6rt",
        title: "Unassigned round",
        manager: "   ",
        managerNeedsReassignment: true,
      }),
      makeSummary({
        publicId: "m7n2p9x4k6rt",
        title: "Unnamed manager round",
        manager: "   ",
        managerNeedsReassignment: false,
      }),
    ]);

    const activeRow = within(screen.getByRole("row", { name: /Active manager round/ }));
    const activeCell = activeRow.getAllByRole("cell")[2]!;
    expect(within(activeCell).getByText("Dana Reed")).toBeVisible();
    expect(activeCell.querySelector("[data-initials]")).toHaveAttribute("data-initials", "DR");
    expect(within(activeCell).queryByText("Reassignment needed")).not.toBeInTheDocument();
    expect(within(activeCell).queryByText("Needs assignment")).not.toBeInTheDocument();

    const formerRow = within(screen.getByRole("row", { name: /Former manager round/ }));
    const formerCell = formerRow.getAllByRole("cell")[2]!;
    expect(within(formerCell).getByText("Samira Patel")).toBeVisible();
    expect(formerCell.querySelector("[data-initials]")).toHaveAttribute("data-initials", "SP");
    const reassignmentBadge = within(formerCell).getByText("Reassignment needed");
    expect(reassignmentBadge).toBeVisible();
    expect(reassignmentBadge).toHaveAttribute("data-tone", "warning");

    const unassignedRow = within(screen.getByRole("row", { name: /Unassigned round/ }));
    const unassignedCell = unassignedRow.getAllByRole("cell")[2]!;
    const needsAssignmentBadge = within(unassignedCell).getByText("Needs assignment");
    expect(needsAssignmentBadge).toBeVisible();
    expect(needsAssignmentBadge).toHaveAttribute("data-tone", "warning");
    expect(unassignedCell.querySelector("[data-initials]")).toBeNull();
    expect(within(unassignedCell).queryByText("Name not recorded")).not.toBeInTheDocument();

    const unnamedRow = within(screen.getByRole("row", { name: /Unnamed manager round/ }));
    const unnamedCell = unnamedRow.getAllByRole("cell")[2]!;
    expect(within(unnamedCell).getByText("Name not recorded")).toBeVisible();
    expect(unnamedCell.querySelector("[data-initials]")).toBeNull();
    expect(within(unnamedCell).queryByText("Needs assignment")).not.toBeInTheDocument();
    expect(within(unnamedCell).queryByText("Reassignment needed")).not.toBeInTheDocument();
  });
});
