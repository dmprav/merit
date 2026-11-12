import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";
import { SectionHeader } from "@merit/ui/section-header";

import { teamFixture } from "../../tests/team.fixtures";
import { OrganizationMessagesProvider } from "../messages";
import { InvitationDirectory } from "./invitation-directory";

const invitation = teamFixture.invitations[0]!;
const meta = {
  title: "Features/Team/Invitations",
  tags: ["!autodocs"],
  component: InvitationDirectory,
  parameters: { layout: "fullscreen" },
  args: {
    team: {
      ...teamFixture,
      invitations: [
        { ...invitation, delivery: "sent" },
        {
          ...invitation,
          id: "failed",
          email: "alexandria.montgomery-worthington@community-partnerships.example.org",
        },
        {
          ...invitation,
          id: "expired",
          email: "morgan@example.test",
          expiresAt: new Date("2020-01-01"),
          delivery: "pending",
        },
      ],
    },
    isDisabled: false,
    onResend: fn(),
    onRevoke: fn(),
  },
  argTypes: { team: { control: false } },
  decorators: [
    (Story) => (
      <OrganizationMessagesProvider>
        <ApplicationPage
          locationKey="team-invitations"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
        >
          <PageHeader title="Team" />
          <SectionHeader title="Invitations" />
          <Story />
        </ApplicationPage>
      </OrganizationMessagesProvider>
    ),
  ],
} satisfies Meta<typeof InvitationDirectory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DeliveryStates: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByRole("columnheader", { name: "Recipient" })).toBeInTheDocument();
    const resend = canvas.getAllByRole("button", { name: /Resend invitation to/ });
    await expect(resend).toHaveLength(2);
    await userEvent.click(resend[1]!);
    await expect(args.onResend).toHaveBeenCalledWith(args.team.invitations[2], resend[1]);
  },
};
export const Empty: Story = { args: { team: { ...teamFixture, invitations: [] } } };
export const Pending: Story = {
  args: { isDisabled: true },
  play: async ({ canvas }) => {
    for (const button of canvas.getAllByRole("button")) {
      await expect(button).toBeDisabled();
    }
  },
};
export const FailedAndExpired: Story = {
  args: {
    team: {
      ...teamFixture,
      invitations: [{ ...invitation, expiresAt: new Date("2020-01-01") }],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Email sending failed")).toBeVisible();
    await expect(canvas.getByText("Expired", { exact: true })).toBeVisible();
    await expect(canvas.queryByText("Awaiting acceptance")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Resend invitation to/ })).toBeVisible();
  },
};
export const RestrictedAdministration: Story = {
  args: {
    team: {
      ...teamFixture,
      subject: { ...teamFixture.subject, administration: "administrator" },
      invitations: [{ ...invitation, administration: "administrator" }],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: /Resend invitation to/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Actions for invitation/ }),
    ).not.toBeInTheDocument();
  },
};
export const InvitationMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for invitation to colleague@example.test" }),
    );
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole("menuitem", { name: "Resend" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "Revoke" })).toBeVisible();
  },
};
