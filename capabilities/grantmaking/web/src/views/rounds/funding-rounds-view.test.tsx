import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const managerCell = (title: string) =>
  within(screen.getByRole("row", { name: new RegExp(title) })).getAllByRole("cell")[2]!;

const initials = (cell: HTMLElement) =>
  cell.querySelector("[data-initials]")?.getAttribute("data-initials");

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

  it("shows each round's status as plain text without its organization name", () => {
    renderRounds([makeSummary()]);

    expect(screen.queryByText("Alder Foundation")).not.toBeInTheDocument();
    expect(screen.getByText("Preparing").closest("[data-appearance]")).toBeNull();
  });

  it("identifies a current manager by trimmed name and initials without a warning", () => {
    renderRounds([makeSummary({ title: "Active manager round", manager: "  Dana Reed  " })]);

    const cell = managerCell("Active manager round");
    expect(within(cell).getByText("Dana Reed")).toBeVisible();
    expect(initials(cell)).toBe("DR");
    expect(within(cell).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps a former manager's name and explains that the round needs reassignment", async () => {
    const user = userEvent.setup();
    renderRounds([
      makeSummary({
        title: "Former manager round",
        manager: "Samira Patel",
        managerNeedsReassignment: true,
      }),
    ]);

    const cell = managerCell("Former manager round");
    expect(within(cell).getByText("Samira Patel")).toBeVisible();
    expect(initials(cell)).toBe("SP");
    await user.click(within(cell).getByRole("button", { name: "Reassignment needed" }));

    expect(await screen.findByRole("dialog", { name: "Reassignment needed" })).toHaveTextContent(
      "This person can no longer manage this round. Assign a current program manager.",
    );
  });

  it.each([
    { state: "unassigned", managerNeedsReassignment: true, label: "Unassigned" },
    { state: "unnamed", managerNeedsReassignment: false, label: "Name not recorded" },
  ])(
    "labels a round without a manager name as $state without initials or a warning",
    ({ managerNeedsReassignment, label }) => {
      renderRounds([
        makeSummary({ title: "Nameless round", manager: "   ", managerNeedsReassignment }),
      ]);

      const cell = managerCell("Nameless round");
      expect(within(cell).getByText(label)).toBeVisible();
      expect(initials(cell)).toBeUndefined();
      expect(within(cell).queryByRole("button")).not.toBeInTheDocument();
    },
  );
});
