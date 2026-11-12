import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, mocked, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { AdminDrafts } from "./controllers/drafts";
import { createOrganization } from "./data/server/organizations.functions";
import { OrganizationList } from "./screens";

const meta = {
  title: "Features/Administration/Create organization",
  tags: ["!autodocs"],
  component: OrganizationList,
  args: { result: { status: "ok", value: [] } },
  parameters: { layout: "fullscreen", controls: { disable: true } },
  decorators: [
    (Story) => (
      <StoryEnvironment path="/admin/organizations">
        <AdminDrafts>
          <ApplicationPage
            locationKey="organizations"
            breadcrumb={null}
            breadcrumbLabel="Breadcrumb"
          >
            <Story />
          </ApplicationPage>
        </AdminDrafts>
      </StoryEnvironment>
    ),
  ],
  beforeEach: () => {
    mocked(createOrganization).mockResolvedValue({
      status: "ok",
      value: { organizationId: "org-1" },
    });
  },
} satisfies Meta<typeof OrganizationList>;

export default meta;

type Story = StoryObj<typeof meta>;

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

const openCreation = async ({ canvas, canvasElement, userEvent }: PlayContext) => {
  await userEvent.click(canvas.getByRole("button", { name: "Create organization" }));
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
    name: "Create organization",
  });
  return within(dialog);
};

export const Default: Story = {
  play: async (context) => {
    await openCreation(context);
  },
};
export const SuggestedAddress: Story = {
  play: async (context) => {
    const dialog = await openCreation(context);
    await context.userEvent.type(
      dialog.getByRole("textbox", { name: "Organization name" }),
      "Alder Community Foundation",
    );
    await context.userEvent.tab();

    await expect(dialog.getByRole("textbox", { name: "Workspace address" })).toHaveValue(
      "alder-community-foundation",
    );
  },
};
export const CreationValidation: Story = {
  play: async (context) => {
    const dialog = await openCreation(context);
    await context.userEvent.click(dialog.getByRole("button", { name: "Create organization" }));

    await expect(dialog.getByRole("textbox", { name: "Organization name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

const submitCreation = async (context: PlayContext) => {
  const dialog = await openCreation(context);
  await context.userEvent.type(
    dialog.getByRole("textbox", { name: "Organization name" }),
    "Alder Foundation",
  );
  await context.userEvent.type(
    dialog.getByRole("textbox", { name: "Owner email" }),
    "dana@example.test",
  );
  await context.userEvent.click(dialog.getByRole("button", { name: "Create organization" }));
  return dialog;
};

export const AddressTaken: Story = {
  beforeEach: () => {
    mocked(createOrganization).mockResolvedValue({ status: "address_taken" });
  },
  play: async (context) => {
    const dialog = await submitCreation(context);

    await expect(await dialog.findByRole("alert")).toHaveTextContent(/address/i);
    await expect(dialog.getByRole("textbox", { name: "Owner email" })).toHaveValue(
      "dana@example.test",
    );
  },
};
export const Creating: Story = {
  beforeEach: () => {
    mocked(createOrganization).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    const dialog = await submitCreation(context);

    await expect(await dialog.findByRole("button", { name: "Creating…" })).toBeDisabled();
  },
};
export const CreationFailure: Story = {
  beforeEach: () => {
    mocked(createOrganization).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    const dialog = await submitCreation(context);

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
    await expect(dialog.getByRole("textbox", { name: "Organization name" })).toHaveValue(
      "Alder Foundation",
    );
  },
};
