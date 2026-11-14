import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamData } from "../contracts/team";
import { OrganizationMessagesProvider } from "../messages";
import { TeamView } from "./team-view";

const show = () => {
  const data: TeamData = {
    team: teamFixture,
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

it("shows the member directory without access history", () => {
  show();

  expect(screen.getByRole("table", { name: "Members" })).toBeVisible();
  expect(screen.queryByText("Access history")).not.toBeInTheDocument();
});
