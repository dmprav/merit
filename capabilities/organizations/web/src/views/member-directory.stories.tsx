import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

import { teamFixture } from "../../tests/team.fixtures";
import { OrganizationMessagesProvider } from "../messages";
import { MemberDirectory } from "./member-directory";

const meta = {
  title: "Features/Team/Members",
  tags: ["!autodocs"],
  component: MemberDirectory,
  parameters: { layout: "fullscreen" },
  args: { team: teamFixture, isDisabled: false, onEdit: fn(), onRemove: fn() },
  argTypes: { team: { control: false } },
  decorators: [
    (Story) => (
      <OrganizationMessagesProvider>
        <ApplicationPage locationKey="team-members" breadcrumb={null} breadcrumbLabel="Breadcrumb">
          <PageHeader title="Team" />
          <Story />
        </ApplicationPage>
      </OrganizationMessagesProvider>
    ),
  ],
} satisfies Meta<typeof MemberDirectory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Owner: Story = {};
export const ReadOnly: Story = {
  args: {
    team: {
      ...teamFixture,
      subject: { ...teamFixture.subject, administration: "none" },
      invitations: [],
    },
  },
};
export const LongAndMissingIdentity: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Boundary case for nullable identity data. Normal invitation acceptance records an email; this fixture deliberately omits both name and email to exercise the fallback.",
      },
    },
  },
  args: {
    team: {
      ...teamFixture,
      members: [
        {
          ...teamFixture.members[0]!,
          name: "Alexandria Montgomery-Worthington",
          email: "alexandria.montgomery-worthington@community-partnerships.example.org",
        },
        { ...teamFixture.members[1]!, name: null, email: null },
      ],
    },
  },
};
export const DisabledAccount: Story = {
  args: {
    team: {
      ...teamFixture,
      members: teamFixture.members.map((member, index) =>
        index === 1 ? { ...member, active: false } : member,
      ),
    },
  },
};
export const Pending: Story = { args: { isDisabled: true } };
export const MemberMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Morgan Lee" }));

    await expect(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Remove from organization",
      }),
    ).toBeVisible();
  },
};
