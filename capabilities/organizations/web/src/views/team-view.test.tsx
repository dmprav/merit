import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { TeamHistoryPage } from "@merit/organizations/api";
import { createQueryClient } from "@merit/query";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamData } from "../contracts/team";
import { OrganizationMessagesProvider } from "../messages";
import { TeamView } from "./team-view";

const showHistory = (history?: TeamHistoryPage["entries"]) => {
  const data: TeamData = {
    team: teamFixture,
    historySource: history && {
      queryKey: ["private", "team", "history"],
      read: async () => ({ entries: history, nextCursor: null }),
    },
    fetching: false,
    invite: vi.fn(),
    changeMember: vi.fn(),
    removeMember: vi.fn(),
    resend: vi.fn(),
    revoke: vi.fn(),
    refresh: vi.fn(),
    refreshAfterSave: vi.fn(),
  };
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TeamView data={data} />
    </QueryClientProvider>,
    { wrapper: OrganizationMessagesProvider },
  );
};

it("omits access history when no history source is supplied", () => {
  showHistory();

  expect(screen.queryByText("Access history")).not.toBeInTheDocument();
});

it("shows the recorded target, actor, interface, and UTC time in access history", async () => {
  const user = userEvent.setup();
  showHistory([
    {
      eventId: "removed",
      action: "membership.removed",
      actor: "Dana Reed",
      provenance: { interface: "mcp", clientId: "review-client" },
      recordedAt: "2026-11-11T10:30:00+02:00",
      details: { targetName: "Former member", email: "former@example.test" },
    },
  ]);
  await user.click(screen.getByText("Access history"));

  expect(await screen.findByRole("listitem")).toHaveTextContent("Member removed: Former member");
  expect(screen.queryByText("former@example.test")).not.toBeInTheDocument();
  expect(screen.getByText("Recorded by Dana Reed")).toBeVisible();
  expect(screen.getByText("via MCP client review-client")).toBeVisible();
  expect(screen.getByText("11/11/2026, 08:30:00 UTC")).toHaveAttribute(
    "datetime",
    "2026-11-11T10:30:00+02:00",
  );
});

it.each<{ details: TeamHistoryPage["entries"][number]["details"]; label: string }>([
  { details: { email: "former@example.test" }, label: "Invitation revoked: former@example.test" },
  { details: null, label: "Invitation revoked" },
  { details: ["former@example.test"], label: "Invitation revoked" },
  { details: { targetName: 42 }, label: "Invitation revoked" },
])(
  "preserves missing attribution and handles history details: $details",
  async ({ details, label }) => {
    const user = userEvent.setup();
    showHistory([
      {
        eventId: "revoked",
        action: "team_invitation.revoked",
        actor: null,
        provenance: null,
        recordedAt: "2026-11-11T08:30:00Z",
        details,
      },
    ]);
    await user.click(screen.getByText("Access history"));

    expect((await screen.findByRole("listitem")).querySelector("p")?.textContent).toBe(label);
    expect(screen.getByText("Recorded by Member")).toBeVisible();
    expect(screen.getByText("Interface not recorded")).toBeVisible();
  },
);
