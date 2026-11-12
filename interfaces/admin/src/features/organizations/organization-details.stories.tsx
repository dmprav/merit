import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, mocked, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { AdminPageState } from "../../shared/admin-page-state";
import type { Organization } from "./contracts";
import { AdminDrafts } from "./controllers/drafts";
import {
  inviteAdministrator,
  readOrganization,
  renameOrganization,
  revokeInvitation,
} from "./data/server/organizations.functions";
import { OrganizationDetails } from "./screens";

const organization: Organization = {
  id: "org-1",
  name: "Alder Foundation",
  slug: "alder",
  canOpenWorkspace: false,
  hasOwner: false,
  owner: null,
  invitation: {
    id: "invite-1",
    email: "dana@example.test",
    delivery: "sent",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    expiresAt: new Date("2099-11-08T10:00:00Z"),
    acceptedAt: null,
    revokedAt: null,
  },
};

const OrganizationDetailsPreview = ({
  record = organization,
  status,
}: {
  record?: Organization;
  status?: Parameters<typeof AdminPageState>[0]["status"];
}) => (
  <StoryEnvironment path="/admin/organizations/org-1">
    <AdminDrafts>
      <ApplicationPage locationKey="organization" breadcrumb={null} breadcrumbLabel="Breadcrumb">
        {status ? (
          <AdminPageState status={status} returnTo="/admin/organizations" />
        ) : (
          <OrganizationDetails result={{ status: "ok", value: record }} />
        )}
      </ApplicationPage>
    </AdminDrafts>
  </StoryEnvironment>
);

const meta = {
  title: "Features/Administration/Organization details",
  tags: ["!autodocs"],
  component: OrganizationDetailsPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: ({ args }) => {
    let record = structuredClone(args.record ?? organization);
    mocked(readOrganization).mockImplementation(async () => ({ status: "ok", value: record }));
    mocked(renameOrganization).mockImplementation(async ({ data }) => {
      record = { ...record, name: data.name };
      return { status: "ok", value: null };
    });
    mocked(inviteAdministrator).mockImplementation(async ({ data }) => {
      record = { ...record, invitation: { ...organization.invitation!, email: data.email } };
      return { status: "ok", value: null };
    });
    mocked(revokeInvitation).mockImplementation(async () => {
      record = {
        ...record,
        invitation: { ...record.invitation!, revokedAt: new Date("2026-11-09T10:00:00Z") },
      };
      return { status: "ok", value: null };
    });
  },
} satisfies Meta<typeof OrganizationDetailsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AwaitingOwner: Story = {};
export const OwnerJoined: Story = {
  args: {
    record: {
      ...organization,
      hasOwner: true,
      owner: { name: "Dana Reed" },
      canOpenWorkspace: true,
    },
  },
};
export const OwnerNameUnavailable: Story = {
  args: { record: { ...organization, hasOwner: true, owner: { name: null } } },
};
export const NeedsOwner: Story = { args: { record: { ...organization, invitation: null } } };
export const DeliveryFailed: Story = {
  args: {
    record: { ...organization, invitation: { ...organization.invitation!, delivery: "failed" } },
  },
};
export const EditingName: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit name" }));
    await userEvent.clear(canvas.getByRole("textbox", { name: "Organization name" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Organization name" }),
      "Alder Community Foundation",
    );

    await expect(canvas.getByRole("textbox", { name: "Organization name" })).toHaveValue(
      "Alder Community Foundation",
    );
  },
};
export const NameSaveFailure: Story = {
  beforeEach: () => {
    mocked(renameOrganization).mockResolvedValue({ status: "unavailable" });
  },
  play: async (context) => {
    await EditingName.play!(context);
    await context.userEvent.click(context.canvas.getByRole("button", { name: "Save name" }));

    await waitFor(async () => expect(await context.canvas.findByRole("alert")).toBeVisible());
    await expect(context.canvas.getByRole("textbox", { name: "Organization name" })).toHaveValue(
      "Alder Community Foundation",
    );
  },
};
export const ChangeRecipient: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Change recipient" }));
    const email = canvas.getByRole("textbox", { name: "Owner email" });
    await userEvent.clear(email);
    await userEvent.type(email, "morgan@example.test");
  },
};
export const ConfirmReplacement: Story = {
  play: async (context) => {
    await ChangeRecipient.play!(context);
    await context.userEvent.click(context.canvas.getByRole("button", { name: "Change recipient" }));
    const dialog = within(context.canvasElement.ownerDocument.body).getByRole("dialog");

    await expect(dialog).toHaveTextContent("morgan@example.test instead of dana@example.test");
  },
};
export const ReplacementFailure: Story = {
  beforeEach: () => {
    mocked(inviteAdministrator).mockResolvedValue({ status: "unavailable" });
  },
  play: async (context) => {
    await ConfirmReplacement.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(
      dialog.getByRole("button", { name: "Change recipient and send" }),
    );

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
  },
};
export const ConfirmRevocation: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revoke invitation" }));

    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog"),
    ).toHaveAccessibleDescription(/dana@example.test/);
  },
};
export const Revoking: Story = {
  beforeEach: () => {
    mocked(revokeInvitation).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    await ConfirmRevocation.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Revoke invitation" }));

    await expect(
      await dialog.findByRole("button", { name: "Revoking invitation…" }),
    ).toHaveAttribute("aria-disabled", "true");
  },
};
export const SavedButRefreshFailed: Story = {
  beforeEach: () => {
    mocked(readOrganization).mockRejectedValueOnce(new Error("Preview refresh failure"));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Resend invitation" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your change was saved");
    await expect(canvas.getByRole("button", { name: "Refresh status" })).toBeEnabled();
  },
};
export const OwnerJoinedAfterRefresh: Story = {
  beforeEach: () => {
    mocked(readOrganization)
      .mockRejectedValueOnce(new Error("Preview refresh failure"))
      .mockResolvedValueOnce({
        status: "ok",
        value: {
          ...organization,
          hasOwner: true,
          owner: { name: "Dana Reed" },
          invitation: { ...organization.invitation!, acceptedAt: new Date("2026-11-09T10:00:00Z") },
        },
      });
  },
  play: async (context) => {
    await SavedButRefreshFailed.play!(context);
    await context.userEvent.click(context.canvas.getByRole("button", { name: "Refresh status" }));

    await waitFor(() =>
      expect(context.canvas.getByRole("region", { name: "Owner" })).toBeVisible(),
    );
  },
};
export const AccessRequired: Story = { args: { status: "forbidden" } };
export const Unavailable: Story = { args: { status: "unavailable" } };
