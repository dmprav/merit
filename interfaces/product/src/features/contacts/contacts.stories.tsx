import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { ContactsDirectory } from "./contacts";
import { configureContacts } from "./contacts.story-fixtures";

const leah = {
  id: "60000000-0000-4000-8000-000000000001",
  name: "Leah Martin",
  email: "leah@example.test",
  affiliation: "Neighbourhood Kitchen",
  archived: false,
  revision: 0,
  applicationTitles: ["Neighbour Table"],
};

const meta = {
  title: "Features/Contacts/Directory",
  tags: ["!autodocs"],
  component: ContactsDirectory,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: {
    workspaceSlug: "alder",
    contacts: [
      leah,
      {
        id: "60000000-0000-4000-8000-000000000002",
        name: "Alexandria Montgomery-Worthington",
        email: "alexandria@example.test",
        affiliation: "Community partnerships",
        archived: false,
        revision: 0,
      },
      {
        id: "60000000-0000-4000-8000-000000000003",
        name: "",
        email: "office@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
      },
    ],
  },
  decorators: [
    (Story) => (
      <StoryEnvironment>
        <ApplicationPage locationKey="contacts" breadcrumb={null} breadcrumbLabel="Breadcrumb">
          <Story />
        </ApplicationPage>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => configureContacts(args.contacts),
} satisfies Meta<typeof ContactsDirectory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const History: Story = {
  args: {
    contacts: [
      {
        ...leah,
        email: "",
        revision: 1,
        history: [
          {
            contactId: leah.id,
            revision: 1,
            actor: "Dana Reed",
            provenance: { interface: "mcp", clientId: "example-client" },
            recordedAt: "2026-11-09T10:00:00Z",
            before: leah,
            after: { ...leah, email: "" },
          },
        ],
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Contact history for Leah Martin" });
    await userEvent.click(trigger);
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Contact history" }),
    );
    await waitFor(() => expect(dialog.getByText("Recorded by Dana Reed")).toBeVisible());
    await expect(dialog.getByText("via MCP client example-client")).toBeVisible();
    await expect(dialog.getByText("leah@example.test")).toBeVisible();
    const saved = within(dialog.getByRole("group", { name: "Saved" }));
    await expect(saved.getByText("Not provided")).toBeVisible();
    for (const label of ["Before", "Saved"]) {
      const values = within(dialog.getByRole("group", { name: label }));
      await expect(values.getAllByText("Changed")).toHaveLength(1);
      await expect(
        within(values.getByText("Email").closest("dt")!).getByText("Changed"),
      ).toBeVisible();
    }
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
  },
};

export const Empty: Story = {
  args: { contacts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No contacts yet.")).toBeVisible();
  },
};

export const EmptyActive: Story = {
  args: { contacts: [{ ...leah, archived: true }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No active contacts.")).toBeVisible();
  },
};

export const LongHistory: Story = {
  args: {
    contacts: [
      {
        ...leah,
        history: Array.from({ length: 8 }, (_, index) => ({
          contactId: leah.id,
          revision: index + 1,
          actor: "Dana Reed",
          provenance: { interface: "web" },
          recordedAt: "2026-11-09T10:00:00Z",
          before: index === 0 ? null : leah,
          after: { ...leah, affiliation: `Community programme ${index + 1}` },
        })),
      },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Contact history for Leah Martin" }));
  },
};

export const EmptyArchived: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Status/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", { name: "Archived" }),
    );
    await expect(canvas.getByText("No archived contacts.")).toBeVisible();
  },
};

export const NoSearchResults: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a contact" }), "Morgan");
    await expect(canvas.getByText("No contacts match your search.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Clear search" })).toBeVisible();
  },
};
