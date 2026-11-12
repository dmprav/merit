import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
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
      membershipVersion: data.expectedVersion + 1,
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

it("shows a read-only directory to program managers and protects the owner", async () => {
  const user = userEvent.setup();
  const { unmount } = show({
    ...initial,
    subject: { ...initial.subject, administration: "none" },
    invitations: [],
  });

  expect(screen.getByText("Morgan Lee")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Refresh team" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit access" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Invitations/ })).not.toBeInTheDocument();

  unmount();
  show();
  const owner = screen.getByText("Dana Reed").closest("tr")!;
  await user.click(within(owner).getByRole("button", { name: "Actions for Dana Reed" }));

  expect(screen.getByRole("menuitem", { name: "Edit access" })).toBeVisible();
  expect(
    screen.queryByRole("menuitem", { name: "Remove from organization" }),
  ).not.toBeInTheDocument();
});

it("reviews handover and invitation revocation before removing a member and restores useful focus", async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove from organization" }));
  const dialog = screen.getByRole("dialog", { name: "Remove Morgan Lee from Alder Foundation?" });

  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(dialog).toHaveTextContent("colleague@example.test");
  expect(dialog).toHaveTextContent(
    "Merit cannot yet list everything this person needs to hand over.",
  );
  expect(removeMember).not.toHaveBeenCalled();

  vi.mocked(readTeam).mockResolvedValue({
    status: "ok",
    value: { ...initial, members: initial.members.slice(0, 1), invitations: [] },
  });
  await user.click(within(dialog).getByRole("button", { name: "Remove from organization" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(removeMember).toHaveBeenCalledWith({
    data: {
      workspaceSlug: "alder",
      userId: "admin",
      expectedMembershipId: "00000000-0000-4000-a000-000000000002",
      expectedVersion: 3,
      expectedInvitationIds: ["pending"],
    },
  });
  expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("tab", { name: /Members/ })).toHaveFocus());

  await user.click(await screen.findByRole("tab", { name: /Invitations 0/ }));

  expect(screen.getByText("No outstanding invitations.")).toBeVisible();
  const revalidation = invalidate.mock.calls[0]?.[0];
  assert(revalidation);
  expect(revalidation.filter({ routeId: "/_product/app/$workspaceSlug/settings/members" })).toBe(
    false,
  );
  expect(revalidation.filter({ routeId: "/_product/app/$workspaceSlug" })).toBe(true);
});

it("retains an invitation after failure and keeps a successful change distinct from refresh failure", async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole("button", { name: "Invite member" }));
  const dialog = screen.getByRole("dialog", { name: "Invite member" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Email address" }),
    "next@example.test",
  );
  vi.mocked(inviteMember).mockResolvedValueOnce({ status: "unavailable" });
  await user.click(within(dialog).getByRole("button", { name: "Invite member" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your entries are preserved");
  expect(within(dialog).getByRole("textbox", { name: "Email address" })).toHaveValue(
    "next@example.test",
  );

  vi.mocked(readTeam).mockRejectedValueOnce(new Error("offline"));
  await user.click(within(dialog).getByRole("button", { name: "Invite member" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByRole("alert")).toHaveTextContent("The latest team could not be loaded");
  const confirmation = await screen.findByText(
    "Invitation saved. Check its email delivery status below.",
    { selector: '[role="status"]' },
  );
  expect(screen.getByRole("button", { name: "Invite member" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh team" })).toHaveFocus());

  await user.click(await screen.findByRole("button", { name: "Refresh team" }));

  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("tab", { name: /Invitations/ })).toHaveFocus());
  expect(confirmation).toBeInTheDocument();
  expect(confirmation).toHaveTextContent(
    "Invitation saved. Check its email delivery status below.",
  );
  expect(inviteMember).toHaveBeenCalledTimes(2);
  expect(
    (
      vi.mocked(inviteMember).mock.calls[0] ??
      assert.fail("Expected vi.mocked(inviteMember).mock.calls[0]")
    )[0].data.requestId,
  ).toBe(
    (
      vi.mocked(inviteMember).mock.calls[1] ??
      assert.fail("Expected vi.mocked(inviteMember).mock.calls[1]")
    )[0].data.requestId,
  );
});

it("keeps a stale edit open for recovery instead of announcing success", async () => {
  const user = userEvent.setup();
  show();
  const member = screen.getByText("Morgan Lee").closest("tr")!;
  await user.click(within(member).getByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit access" }));
  const dialog = screen.getByRole("dialog", { name: "Edit access for Morgan Lee" });
  vi.mocked(changeMember).mockResolvedValueOnce({ status: "conflict" });
  await user.click(within(dialog).getByRole("button", { name: "Save access" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("refresh the team");
  expect(dialog).toBeVisible();
  expect(invalidate).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole("button", { name: "Close" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Team details have changed");

  await user.click(await screen.findByRole("button", { name: "Refresh team" }));

  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Refresh team" })).not.toBeInTheDocument();
});

it("shows issued invitations when demoting an administrator and clears the warning when retaining administration", async () => {
  const user = userEvent.setup();
  show();
  const member = screen.getByText("Morgan Lee").closest("tr")!;
  await user.click(within(member).getByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit access" }));
  const dialog = screen.getByRole("dialog", { name: "Edit access for Morgan Lee" });

  expect(within(dialog).queryByText("colleague@example.test")).not.toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: /Organization responsibility/ }));
  await user.click(await screen.findByRole("option", { name: "Member" }));

  expect(within(dialog).getByText("colleague@example.test")).toBeVisible();

  await user.click(within(dialog).getByRole("button", { name: /Organization responsibility/ }));
  await user.click(await screen.findByRole("option", { name: "Administrator" }));

  expect(within(dialog).queryByText("colleague@example.test")).not.toBeInTheDocument();
});

it("returns focus to the member menu after cancelling removal", async () => {
  const user = userEvent.setup();
  show();
  const trigger = screen.getByRole("button", { name: "Actions for Morgan Lee" });
  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Remove from organization" }));
  await user.keyboard("{Escape}");

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(removeMember).not.toHaveBeenCalled();
});

it("keeps removal pending and preserves consequences after failure", async () => {
  const user = userEvent.setup();
  let finish!: (value: Awaited<ReturnType<typeof removeMember>>) => void;
  vi.mocked(removeMember).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  show();
  await user.click(await screen.findByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove from organization" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Remove from organization" }));

  expect(within(dialog).getByRole("button", { name: "Removing member…" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Close dialog" })).toBeDisabled();

  await user.keyboard("{Escape}");

  expect(dialog).toBeVisible();

  finish({ status: "conflict" });

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("refresh the team");
  expect(dialog).toHaveTextContent("colleague@example.test");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
});

it("confirms revocation from the invitation menu and restores focus to invitations", async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole("tab", { name: /Invitations/ }));
  const trigger = screen.getByRole("button", {
    name: "Actions for invitation to colleague@example.test",
  });
  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Revoke" }));
  let dialog = screen.getByRole("dialog", { name: "Revoke invitation?" });

  expect(dialog).toHaveTextContent("colleague@example.test");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

  await user.keyboard("{Escape}");

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(revokeMemberInvitation).not.toHaveBeenCalled();

  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Revoke" }));
  dialog = screen.getByRole("dialog", { name: "Revoke invitation?" });
  vi.mocked(readTeam).mockResolvedValue({ status: "ok", value: { ...initial, invitations: [] } });
  await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revokeMemberInvitation).toHaveBeenCalledWith({
    data: { workspaceSlug: "alder", invitationId: "pending" },
  });
  expect(await screen.findByText("No outstanding invitations.")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("tab", { name: /Invitations/ })).toHaveFocus());
});

it("preserves the invitation and confirmation after a failed revocation, then retries", async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole("tab", { name: /Invitations/ }));
  await user.click(
    screen.getByRole("button", { name: "Actions for invitation to colleague@example.test" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Revoke" }));
  const dialog = screen.getByRole("dialog", { name: "Revoke invitation?" });
  vi.mocked(revokeMemberInvitation).mockResolvedValueOnce({ status: "unavailable" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "We couldn’t complete this action",
  );
  expect(dialog).toHaveTextContent("colleague@example.test");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
  expect(within(dialog).queryByText("Work to hand over")).not.toBeInTheDocument();
  expect(readTeam).not.toHaveBeenCalled();

  vi.mocked(readTeam).mockResolvedValue({ status: "ok", value: { ...initial, invitations: [] } });
  await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revokeMemberInvitation).toHaveBeenCalledTimes(2);
  expect(revokeMemberInvitation).toHaveBeenLastCalledWith({
    data: { workspaceSlug: "alder", invitationId: "pending" },
  });
  expect(await screen.findByText("No outstanding invitations.")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("tab", { name: /Invitations/ })).toHaveFocus());
});

it.each(["menu", "inline"] as const)(
  "resends an invitation from its %s action and keeps failed sending recoverable",
  async (action) => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("tab", { name: /Invitations/ }));
    const trigger = screen.getByRole("button", {
      name:
        action === "menu"
          ? "Actions for invitation to colleague@example.test"
          : "Resend invitation to colleague@example.test",
    });
    vi.mocked(resendMemberInvitation).mockResolvedValueOnce({ status: "unavailable" });
    await user.click(trigger);
    if (action === "menu") {
      await user.click(await screen.findByRole("menuitem", { name: "Resend" }));
    }

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t complete this action");
    await waitFor(() => expect(trigger).toHaveFocus());

    vi.mocked(readTeam).mockResolvedValue({
      status: "ok",
      value: {
        ...initial,
        invitations: [{ ...initial.invitations[0]!, id: "replacement", delivery: "sent" }],
      },
    });
    await user.click(trigger);
    if (action === "menu") {
      await user.click(await screen.findByRole("menuitem", { name: "Resend" }));
    }

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(resendMemberInvitation).toHaveBeenLastCalledWith({
      data: { workspaceSlug: "alder", invitationId: "pending" },
    });
    if (action === "menu") {
      await waitFor(() => expect(trigger).toHaveFocus());
    } else {
      await waitFor(() => expect(trigger).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("tab", { name: /Invitations/ })).toHaveFocus());
    }
  },
);

it("lets administrators manage ordinary invitations but protects administrator invitations", async () => {
  const user = userEvent.setup();
  const administratorInvite = {
    ...initial.invitations[0]!,
    id: "admin-invite",
    email: "admin@example.test",
    administration: "administrator" as const,
  };
  show({
    ...initial,
    subject: { ...initial.subject, administration: "administrator" },
    invitations: [...initial.invitations, administratorInvite],
  });
  await user.click(await screen.findByRole("tab", { name: /Invitations/ }));
  const invitations = screen.getByRole("table", { name: "Invitations" });

  expect(within(invitations).getByText("admin@example.test")).toBeVisible();
  expect(
    within(invitations).queryByRole("button", {
      name: "Actions for invitation to admin@example.test",
    }),
  ).not.toBeInTheDocument();
  expect(
    within(invitations).queryByRole("button", {
      name: "Resend invitation to admin@example.test",
    }),
  ).not.toBeInTheDocument();

  await user.click(
    within(invitations).getByRole("button", {
      name: "Actions for invitation to colleague@example.test",
    }),
  );

  expect(screen.getByRole("menuitem", { name: "Resend" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Revoke" })).toBeVisible();
});

it("shows one directory at a time with counts and keyboard access to invitations", async () => {
  const user = userEvent.setup();
  show();
  const members = screen.getByRole("tab", { name: "Members 2" });

  expect(members).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("table", { name: "Members" })).toBeVisible();
  expect(screen.queryByRole("table", { name: "Invitations" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Invitations 1" })).toHaveAccessibleDescription(
    "Expired or failed invitations need attention",
  );

  members.focus();
  await user.keyboard("{ArrowRight}");

  expect(screen.getByRole("tab", { name: "Invitations 1" })).toHaveFocus();
  expect(screen.getByRole("table", { name: "Invitations" })).toBeVisible();
  expect(screen.queryByRole("table", { name: "Members" })).not.toBeInTheDocument();
});

it("keeps the invitation draft across tab changes and reveals the invitation after saving", async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole("button", { name: "Invite member" }));
  let dialog = screen.getByRole("dialog", { name: "Invite member" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Email address" }),
    "next@example.test",
  );
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await user.click(await screen.findByRole("tab", { name: /Invitations/ }));
  await user.click(await screen.findByRole("tab", { name: /Members/ }));
  await user.click(await screen.findByRole("button", { name: "Resume invitation" }));
  dialog = screen.getByRole("dialog", { name: "Invite member" });

  expect(within(dialog).getByRole("textbox", { name: "Email address" })).toHaveValue(
    "next@example.test",
  );

  vi.mocked(readTeam).mockResolvedValue({
    status: "ok",
    value: {
      ...initial,
      invitations: [{ ...initial.invitations[0]!, email: "next@example.test", delivery: "sent" }],
    },
  });
  await user.click(within(dialog).getByRole("button", { name: "Invite member" }));

  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Invitations 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
  expect(screen.getByText("next@example.test")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Invitations 1" })).not.toHaveAccessibleDescription();
  await waitFor(() => expect(screen.getByRole("tab", { name: "Invitations 1" })).toHaveFocus());
});

it("restores an access draft after reload without silently accepting a newer membership version", async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const first = show(initial, "team-draft-test");
  await user.click(await screen.findByRole("button", { name: "Actions for Morgan Lee" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit access" }));
  await user.click(await screen.findByRole("button", { name: /Grant-work access/ }));
  await user.click(await screen.findByRole("option", { name: "Program manager" }));
  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  expect(
    await screen.findByRole("button", { name: "Resume access changes for Morgan Lee" }),
  ).toBeVisible();

  first.unmount();
  const changed = {
    ...initial,
    members: initial.members.map((member) => ({ ...member, version: member.version + 1 })),
  };
  vi.mocked(readTeam).mockResolvedValue({ status: "ok", value: changed });
  show(changed, "team-draft-test");
  await user.click(
    await screen.findByRole("button", { name: "Resume access changes for Morgan Lee" }),
  );

  expect(screen.getByRole("button", { name: "Save access" })).toBeDisabled();
  expect(screen.getByText(/Access or issued invitations changed/)).toBeVisible();
  expect(screen.getByRole("button", { name: /Program manager Grant-work access/ })).toBeVisible();

  await user.click(await screen.findByRole("button", { name: "Discard changes" }));

  expect(
    screen.queryByRole("button", { name: "Resume access changes for Morgan Lee" }),
  ).not.toBeInTheDocument();
  expect(changeMember).not.toHaveBeenCalled();

  sessionStorage.clear();
});
