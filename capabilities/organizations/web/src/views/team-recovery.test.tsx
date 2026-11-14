import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { useDrafts } from "@merit/drafts";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamData } from "../contracts/team";
import { OrganizationMessagesProvider } from "../messages";
import { TeamView } from "./team-view";

vi.mock("@merit/drafts", () => ({ useDrafts: vi.fn() }));

const invitation = {
  requestId: "10000000-0000-4000-8000-000000000001",
  email: "unfinished@example.test",
  administration: "none",
  role: "program_manager",
};
const updateInvitations = vi.fn();
const updateAccess = vi.fn();
let invitationReady = false;
let accessReady = false;

beforeEach(() => {
  invitationReady = false;
  accessReady = false;
  updateInvitations.mockClear();
  updateAccess.mockClear();
  vi.mocked(useDrafts).mockImplementation((_scope, kind) => ({
    drafts: kind === "team-invitations" && invitationReady ? { alder: invitation } : {},
    ready: kind === "team-invitations" ? invitationReady : accessReady,
    status: "restoring",
    storageUnavailable: false,
    update: kind === "team-invitations" ? updateInvitations : updateAccess,
  }));
});

const show = () => {
  const data: TeamData = {
    team: teamFixture,
    fetching: false,
    invite: vi.fn().mockResolvedValue({ status: "unavailable" }),
    changeMember: vi.fn(),
    removeMember: vi.fn(),
    resend: vi.fn(),
    revoke: vi.fn(),
    refresh: vi.fn(),
    refreshAfterSave: vi.fn(),
  };
  const page = (
    <OrganizationMessagesProvider>
      <TeamView data={data} draftScope="account" />
    </OrganizationMessagesProvider>
  );
  const view = render(page);
  return {
    data,
    recover: (kind: "invitation" | "access") => {
      if (kind === "invitation") {
        invitationReady = true;
      } else {
        accessReady = true;
      }
      view.rerender(
        <OrganizationMessagesProvider>
          <TeamView data={data} draftScope="account" />
        </OrganizationMessagesProvider>,
      );
    },
  };
};

it("shows the team while restoring and waits only for invitation drafts before opening recovered writing", async () => {
  const user = userEvent.setup();
  const { data, recover } = show();
  expect(screen.getByRole("table", { name: "Members" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Invite member" }));
  const dialog = screen.getByRole("dialog", { name: "Invite member" });
  expect(within(dialog).getByText("Preparing editor…")).toBeVisible();
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  expect(updateInvitations).not.toHaveBeenCalled();
  recover("invitation");
  expect(await within(dialog).findByRole("textbox", { name: "Email address" })).toHaveValue(
    invitation.email,
  );
  await user.click(within(dialog).getByRole("button", { name: "Invite member" }));
  expect(data.invite).toHaveBeenCalledWith({ ...invitation, workspaceSlug: "alder" });
});

it("closing during restoration leaves recovered invitations unchanged and does not reopen", async () => {
  const user = userEvent.setup();
  const { recover } = show();
  await user.click(screen.getByRole("button", { name: "Invite member" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Close dialog" }),
  );
  recover("invitation");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(updateInvitations).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume invitation" }));
  expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(invitation.email);
});

it("opens member access as soon as its own store is ready while invitations still restore", async () => {
  const user = userEvent.setup();
  const { recover } = show();
  await user.click(screen.getByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit access" }));
  const dialog = screen.getByRole("dialog", { name: "Edit access for Morgan Lee" });
  expect(within(dialog).getByText("Preparing editor…")).toBeVisible();
  expect(within(dialog).queryByRole("form")).not.toBeInTheDocument();
  recover("access");
  expect(await within(dialog).findByRole("button", { name: "Save access" })).toBeEnabled();
  expect(updateAccess).not.toHaveBeenCalled();
  expect(updateInvitations).not.toHaveBeenCalled();
});
