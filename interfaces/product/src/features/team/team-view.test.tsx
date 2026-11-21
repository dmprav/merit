import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

import { OrganizationMessagesProvider } from "@merit/organizations-web/messages";
import { createQueryClient } from "@merit/query";

import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import {
  readTeam,
  inviteMember,
  removeMember,
  changeMember,
  resendMemberInvitation,
  revokeMemberInvitation,
} from "./data/server/team.functions";
import { TeamView } from "./team-view";

const invalidate = vi.hoisted(() =>
  vi
    .fn<(options: { filter: (match: { routeId: string }) => boolean }) => Promise<void>>()
    .mockResolvedValue(undefined),
);
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate }) }));
vi.mock("./data/server/team.functions", () => ({
  readTeam: vi.fn(),
  inviteMember: vi.fn(),
  changeMember: vi.fn(),
  removeMember: vi.fn(),
  resendMemberInvitation: vi.fn(),
  revokeMemberInvitation: vi.fn(),
}));
import { teamFixture as initial } from "@merit/organizations-web/testing";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readTeam).mockResolvedValue({ status: "ok", value: initial });
  vi.mocked(inviteMember).mockImplementation(async ({ data }) => ({
    status: "ok",
    value: { invitationId: data.requestId },
  }));
  vi.mocked(removeMember).mockImplementation(async ({ data }) => ({
    status: "ok",
    value: {
      userId: data.userId,
      membershipId: data.expectedMembershipId,
      membershipVersion: null,
      removed: true,
    },
  }));
  vi.mocked(changeMember).mockImplementation(async ({ data }) => ({
    status: "ok",
    value: {
      userId: data.userId,
      membershipId: data.expectedMembershipId,
      membershipVersion: data.expectedMembershipVersion + 1,
      removed: false,
    },
  }));
  vi.mocked(resendMemberInvitation).mockImplementation(async ({ data }) => ({
    status: "ok",
    value: { invitationId: "replacement", replacesInvitationId: data.invitationId },
  }));
  vi.mocked(revokeMemberInvitation).mockImplementation(async ({ data }) => ({
    status: "ok",
    value: { invitationId: data.invitationId },
  }));
});

const show = (data = initial, draftScope?: string) =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <OrganizationMessagesProvider>
        <WorkspaceNavigationContext value={{ workspaces: [], canAdminister: false, draftScope }}>
          <TeamView initial={data} />
        </WorkspaceNavigationContext>
      </OrganizationMessagesProvider>
    </QueryClientProvider>,
  );

it("sends removal through the team server functions and revalidates every route but the members page", async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove from organization" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Remove from organization" }),
  );

  await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  expect(removeMember).toHaveBeenCalledWith({
    data: {
      workspaceSlug: "alder",
      userId: "admin",
      expectedMembershipId: "00000000-0000-4000-a000-000000000002",
      expectedMembershipVersion: 3,
      expectedInvitationIds: ["pending"],
    },
  });
  expect(readTeam).toHaveBeenCalledWith(
    expect.objectContaining({ data: { workspaceSlug: "alder" } }),
  );
  const revalidation = invalidate.mock.calls[0]?.[0];
  assert(revalidation);
  expect(revalidation.filter({ routeId: "/_product/app/$workspaceSlug/settings/members" })).toBe(
    false,
  );
  expect(revalidation.filter({ routeId: "/_product/app/$workspaceSlug" })).toBe(true);
});

it("sends invitation resend and revocation to their own server functions", async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole("tab", { name: /Invitations/ }));
  const trigger = screen.getByRole("button", {
    name: "Actions for invitation to colleague@example.test",
  });
  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Resend" }));

  await waitFor(() =>
    expect(resendMemberInvitation).toHaveBeenCalledWith({
      data: { workspaceSlug: "alder", invitationId: "pending" },
    }),
  );
  expect(revokeMemberInvitation).not.toHaveBeenCalled();

  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Revoke" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }));

  await waitFor(() =>
    expect(revokeMemberInvitation).toHaveBeenCalledWith({
      data: { workspaceSlug: "alder", invitationId: "pending" },
    }),
  );
  expect(resendMemberInvitation).toHaveBeenCalledOnce();
});

it("keeps unsaved access drafts in the workspace draft scope", async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const first = show(initial, "team-draft-test");
  await user.click(await screen.findByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit access" }));
  await user.click(await screen.findByRole("button", { name: /Grant-work access/ }));
  await user.click(await screen.findByRole("option", { name: /^Program manager/ }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  first.unmount();
  show(initial, "team-draft-test");

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Morgan Lee" })).toHaveAttribute(
      "data-draft",
    ),
  );

  sessionStorage.clear();
});
