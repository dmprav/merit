import type { Meta, StoryObj } from "@storybook/react-vite";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { InvitationSummary } from "./owner-invitation";

const meta = {
  title: "Features/Administration/Owner invitation",
  tags: ["!autodocs"],
  component: InvitationSummary,
  decorators: [
    (Story) => (
      <AdminMessages>
        <Story />
      </AdminMessages>
    ),
  ],
  args: { invitation },
} satisfies Meta<typeof InvitationSummary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AwaitingAcceptance: Story = {};
export const SendingFailed: Story = {
  args: { invitation: { ...invitation, delivery: "failed" } },
};
export const SendingUnconfirmed: Story = {
  args: { invitation: { ...invitation, delivery: "pending" } },
};
export const Expired: Story = {
  args: { invitation: { ...invitation, expiresAt: new Date("2020-01-01") } },
};
export const ExpiredWithSendingFailure: Story = {
  args: {
    invitation: { ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" },
  },
};
export const Joined: Story = {
  args: { invitation: { ...invitation, acceptedAt: new Date("2026-11-02T12:00:00Z") } },
};
export const Revoked: Story = {
  args: { invitation: { ...invitation, revokedAt: new Date("2026-11-02T12:00:00Z") } },
};
export const NeedsAdministrator: Story = { args: { invitation: null } };
export const ExistingOwner: Story = {
  args: {
    hasOwner: true,
    invitation: { ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" },
  },
};
export const ExistingOwnerWithoutInvitation: Story = {
  args: { invitation: null, hasOwner: true },
};
export const WithoutStatusBadge: Story = {
  args: { showStatus: false, invitation: { ...invitation, delivery: "failed" } },
};
export const LongEmail: Story = {
  args: {
    invitation: {
      ...invitation,
      email: "administrator-of-community-programmes@regional-foundation-for-the-arts.example.test",
    },
  },
};
