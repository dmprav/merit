import type { Meta, StoryObj } from "@storybook/react-vite";

import { Stack } from "@merit/ui/layout";
import { Text } from "@merit/ui/text";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { InvitationSummary } from "./owner-invitation";

const meta = {
  title: "Features/Administration/Owner invitation",
  tags: ["!autodocs"],
  component: InvitationSummary,
  parameters: { controls: { disable: true } },
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

const states: {
  label: string;
  props: React.ComponentProps<typeof InvitationSummary>;
}[] = [
  { label: "Awaiting acceptance", props: { invitation } },
  { label: "Sending failed", props: { invitation: { ...invitation, delivery: "failed" } } },
  { label: "Sending unconfirmed", props: { invitation: { ...invitation, delivery: "pending" } } },
  { label: "Expired", props: { invitation: { ...invitation, expiresAt: new Date("2020-01-01") } } },
  {
    label: "Expired with sending failure",
    props: { invitation: { ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" } },
  },
  {
    label: "Joined",
    props: { invitation: { ...invitation, acceptedAt: new Date("2026-11-02T12:00:00Z") } },
  },
  {
    label: "Revoked",
    props: { invitation: { ...invitation, revokedAt: new Date("2026-11-02T12:00:00Z") } },
  },
  { label: "Needs administrator", props: { invitation: null } },
  {
    label: "Existing owner",
    props: {
      hasOwner: true,
      invitation: { ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" },
    },
  },
];

export const States: Story = {
  render: () => (
    <Stack gap={6}>
      {states.map(({ label, props }) => (
        <Stack key={label} as="section" gap={2} aria-label={label}>
          <Text variant="supporting">{label}</Text>
          <InvitationSummary {...props} />
        </Stack>
      ))}
    </Stack>
  ),
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
