import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, mocked, waitFor, within } from "storybook/test";

import { teamFixture } from "@merit/organizations-web/testing";
import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import {
  readTeam,
  inviteMember,
  changeMember,
  removeMember,
  revokeMemberInvitation,
  resendMemberInvitation,
} from "./data/server/team.functions";
import { TeamView } from "./team-view";

const meta = {
  title: "Features/Team/Manage team",
  tags: ["!autodocs"],
  component: TeamView,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { initial: teamFixture },
  decorators: [
    (Story) => (
      <StoryEnvironment path="/app/alder/settings/members">
        <ApplicationPage locationKey="team" breadcrumb={null} breadcrumbLabel="Breadcrumb">
          <Story />
        </ApplicationPage>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => {
    let team = structuredClone(args.initial);
    mocked(readTeam).mockImplementation(async () => ({ status: "ok", value: team }));
    mocked(inviteMember).mockImplementation(async ({ data }) => {
      team = {
        ...team,
        invitations: [
          ...team.invitations,
          {
            id: "new",
            email: data.email,
            administration: data.administration,
            role: data.role,
            invitedBy: team.subject.userId,
            delivery: "sent",
            expiresAt: new Date("2099-11-16T10:00:00Z"),
          },
        ],
      };

      return { status: "ok", value: { invitationId: data.requestId } };
    });
    mocked(changeMember).mockImplementation(async ({ data }) => {
      team = {
        ...team,
        members: team.members.map((member) =>
          member.userId === data.userId
            ? {
                ...member,
                administration: data.administration,
                role: data.role,
                version: member.version + 1,
              }
            : member,
        ),
      };

      return {
        status: "ok",
        value: {
          userId: data.userId,
          membershipId: data.expectedMembershipId,
          membershipVersion: data.expectedVersion + 1,
          removed: false,
        },
      };
    });
    mocked(removeMember).mockImplementation(async ({ data }) => {
      team = {
        ...team,
        members: team.members.filter((member) => member.userId !== data.userId),
        invitations: team.invitations.filter((invitation) => invitation.invitedBy !== data.userId),
      };
      return {
        status: "ok",
        value: {
          userId: data.userId,
          membershipId: data.expectedMembershipId,
          membershipVersion: null,
          removed: true,
        },
      };
    });
    mocked(revokeMemberInvitation).mockImplementation(async ({ data }) => {
      team = {
        ...team,
        invitations: team.invitations.filter((invitation) => invitation.id !== data.invitationId),
      };
      return { status: "ok", value: { invitationId: data.invitationId } };
    });
    mocked(resendMemberInvitation).mockImplementation(async ({ data }) => {
      team = {
        ...team,
        invitations: team.invitations.map((invitation) =>
          invitation.id === data.invitationId
            ? { ...invitation, delivery: "sent", expiresAt: new Date("2099-11-16T10:00:00Z") }
            : invitation,
        ),
      };

      return {
        status: "ok",
        value: { invitationId: data.invitationId, replacesInvitationId: data.invitationId },
      };
    });
  },
} satisfies Meta<typeof TeamView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Owner: Story = {};
export const OwnerAccess: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Dana Reed" }));
    await userEvent.click(body.getByRole("menuitem", { name: "Edit access" }));
    const dialog = within(body.getByRole("dialog"));
    const responsibility = dialog.getByRole("textbox", { name: "Organization responsibility" });
    await expect(responsibility).toHaveValue("Owner");
    await expect(responsibility).toHaveAttribute("readonly");
    await expect(responsibility).toHaveAccessibleDescription(
      "Contact the Merit operator for ownership changes.",
    );
    await userEvent.click(responsibility);
    await expect(responsibility).toHaveFocus();
  },
};
export const Invitations: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("table", { name: "Members" })).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: /Invitations/ }));
    await expect(canvas.queryByRole("table", { name: "Members" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("table", { name: "Invitations" })).toBeVisible();
  },
};
export const EmptyInvitations: Story = {
  args: { initial: { ...teamFixture, invitations: [] } },
  play: Invitations.play,
};
export const ReadOnly: Story = {
  args: {
    initial: {
      ...teamFixture,
      subject: { ...teamFixture.subject, administration: "none" },
      invitations: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table", { name: "Members" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  },
};
export const InviteMember: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Invite member" }));
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Email address" }),
      "leah@example.test",
    );
  },
};
export const AdministratorInviting: Story = {
  args: {
    initial: {
      ...teamFixture,
      subject: {
        ...teamFixture.subject,
        userId: "admin",
        administration: "administrator",
        role: "member",
      },
    },
  },
  play: InviteMember.play,
};
export const InvitationValidation: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Invite member" }));
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Invite member" }));

    await expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};
export const InvitationFailure: Story = {
  beforeEach: () => {
    mocked(inviteMember).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    await InviteMember.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Invite member" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent("Your entries are preserved");
    await expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveValue(
      "leah@example.test",
    );
  },
};
export const EditingAccess: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Actions for Morgan Lee" }));
    await userEvent.click(body.getByRole("menuitem", { name: "Edit access" }));

    await waitFor(async () =>
      expect(body.getByRole("dialog", { name: "Edit access for Morgan Lee" })).toBeVisible(),
    );
  },
};
export const DemotionConsequences: Story = {
  play: async (context) => {
    await EditingAccess.play!(context);
    const body = within(context.canvasElement.ownerDocument.body);
    const dialog = within(body.getByRole("dialog"));
    await context.userEvent.click(
      dialog.getByRole("button", { name: /Organization responsibility/ }),
    );
    await context.userEvent.click(body.getByRole("option", { name: /^Member/ }));

    await expect(dialog.getByText("Saving revokes 1 invitation.")).toBeVisible();
    await expect(dialog.queryByText("colleague@example.test")).not.toBeInTheDocument();
    // Let React Aria clear its transient announcement before the accessibility scan.
    await waitFor(
      () =>
        expect(
          context.canvasElement.ownerDocument.querySelector("[data-live-announcer] [role=img]"),
        ).toBeNull(),
      { timeout: 8000 },
    );
  },
};
export const ManyAffectedInvitations: Story = {
  args: {
    initial: {
      ...teamFixture,
      invitations: Array.from({ length: 30 }, (_, index) => ({
        ...teamFixture.invitations[0]!,
        id: `invitation-${index}`,
        email: `colleague-${index + 1}@example.test`,
      })),
    },
  },
  play: async (context) => {
    await EditingAccess.play!(context);
    const body = within(context.canvasElement.ownerDocument.body);
    const parent = within(body.getByRole("dialog", { name: "Edit access for Morgan Lee" }));
    await context.userEvent.click(
      parent.getByRole("button", { name: /Organization responsibility/ }),
    );
    await context.userEvent.click(body.getByRole("option", { name: /^Member/ }));
    await expect(parent.getByText("Saving revokes 30 invitations.")).toBeVisible();
    await expect(parent.queryByRole("list")).not.toBeInTheDocument();
    await expect(parent.queryByRole("tooltip")).not.toBeInTheDocument();
  },
};

export const StaleAccess: Story = {
  beforeEach: () => {
    mocked(changeMember).mockResolvedValue({ status: "conflict" });
  },
  play: async (context) => {
    await EditingAccess.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Save access" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent("refresh the team");
  },
};
export const RemovalConsequences: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Actions for Morgan Lee" }));
    await userEvent.click(body.getByRole("menuitem", { name: "Remove from organization" }));

    await expect(body.getByRole("dialog")).toHaveTextContent(
      "This also revokes 1 invitation they sent",
    );
  },
};
export const Removing: Story = {
  beforeEach: () => {
    mocked(removeMember).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    await RemovalConsequences.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Remove from organization" }));

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  },
};
export const RemovalFailure: Story = {
  beforeEach: () => {
    mocked(removeMember).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    await RemovalConsequences.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Remove from organization" }));

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
    await expect(dialog.getByText(/This also revokes 1 invitation they sent/)).toBeVisible();
  },
};
export const SavedButRefreshFailed: Story = {
  beforeEach: () => {
    mocked(readTeam).mockRejectedValueOnce(new Error("Preview refresh failure"));
  },
  play: async (context) => {
    await InviteMember.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Invite member" }));

    await expect(await context.canvas.findByRole("alert")).toHaveTextContent(
      "The latest team could not be loaded",
    );
    await expect(context.canvas.getByRole("button", { name: "Refresh team" })).toBeEnabled();
    // Wait for the library's transient announcement of the now-closed invite dialog.
    await waitFor(
      () =>
        expect(
          context.canvasElement.ownerDocument.querySelector("[data-live-announcer] [role=img]"),
        ).toBeNull(),
      { timeout: 8000 },
    );
  },
};

export const RoleChoices: Story = {
  play: async (context) => {
    await OwnerAccess.play!(context);
    const body = within(context.canvasElement.ownerDocument.body);
    await context.userEvent.click(body.getByRole("button", { name: /Grant-work access/ }));
    await expect(body.getByRole("option", { name: /^Program manager/ })).toHaveAccessibleName(
      "Program manager Can view and edit all grant work.",
    );
    await expect(body.getByRole("option", { name: /^No grant-work access/ })).toHaveAccessibleName(
      "No grant-work access Cannot view or edit grant work.",
    );
  },
};
export const ResumeAccess: Story = {
  play: async (context) => {
    await EditingAccess.play!(context);
    const body = within(context.canvasElement.ownerDocument.body);
    await context.userEvent.click(body.getByRole("button", { name: /Grant-work access/ }));
    await context.userEvent.click(body.getByRole("option", { name: /^Program manager/ }));
    await context.userEvent.click(
      within(body.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    const trigger = context.canvas.getByRole("button", { name: "Actions for Morgan Lee" });
    await expect(trigger).toHaveAttribute("data-draft");
    await context.userEvent.click(trigger);
    await expect(body.getByRole("menuitem", { name: "Resume editing access" })).toBeVisible();
    await expect(
      context.canvas.queryByRole("button", { name: "Resume editing access" }),
    ).not.toBeInTheDocument();
  },
};
