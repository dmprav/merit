import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, mocked, waitFor, within } from "storybook/test";

import type { Contact } from "@merit/contacts-web/contracts";

import { StoryEnvironment } from "../../../tests/storybook";
import { ContactPicker } from "./contacts";
import directory from "./contacts.stories";
import { configureContacts } from "./contacts.story-fixtures";
import { readContacts } from "./data/server/contacts.functions";

const PickerPreview = ({
  initialId,
  direct,
  disabledContactIds,
}: {
  contacts: Contact[];
  initialId: string | null;
  direct: boolean;
  disabledContactIds: string[];
}) => {
  const [value, setValue] = useState(initialId);
  return (
    <ContactPicker
      workspaceSlug="alder"
      label="Applicant contact"
      value={value}
      onChange={setValue}
      direct={direct}
      disabledContactIds={disabledContactIds}
    />
  );
};

const meta = {
  title: "Features/Contacts/Contact picker",
  tags: ["!autodocs"],
  component: PickerPreview,
  parameters: { controls: { disable: true } },
  args: {
    contacts: directory.args.contacts,
    initialId: null,
    direct: false,
    disabledContactIds: [],
  },
  decorators: [
    (Story) => (
      <StoryEnvironment>
        <div style={{ maxWidth: "400px" }}>
          <Story />
        </div>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => configureContacts(args.contacts),
} satisfies Meta<typeof PickerPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Applicant contact/ }));
    const [contact] = await within(canvasElement.ownerDocument.body).findAllByRole("option", {
      name: /Leah Martin/,
    });
    await waitFor(() => expect(contact).toBeVisible());
  },
};
export const SameNameContacts: Story = {
  args: {
    contacts: [
      directory.args.contacts[0]!,
      {
        ...directory.args.contacts[0]!,
        id: "60000000-0000-4000-8000-000000000004",
        email: "leah@arts.example.test",
        affiliation: "Community Arts",
        applicationTitles: ["Open Studios"],
      },
    ],
  },
  play: async (context) => {
    await Open.play!(context);
    const page = within(context.canvasElement.ownerDocument.body);
    await expect(page.getAllByRole("option", { name: /Leah Martin/ })).toHaveLength(2);
    await expect(page.getByRole("option", { name: /Open Studios/ })).toBeVisible();
  },
};
export const ArchivedSelection: Story = {
  args: {
    initialId: directory.args.contacts[0]!.id,
    contacts: [{ ...directory.args.contacts[0]!, archived: true }],
  },
  play: async (context) => {
    await Open.play!(context);
    await expect(
      within(context.canvasElement.ownerDocument.body).getByRole("option", { name: /Archived/ }),
    ).toHaveAttribute("aria-disabled", "true");
  },
};
export const UnavailableChoice: Story = {
  args: { direct: true, disabledContactIds: [directory.args.contacts[0]!.id] },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("option", { name: /Leah Martin/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};
export const NoResults: Story = {
  args: { direct: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Find a contact" }),
      "No matching person",
    );
    await expect(await canvas.findByText("No contacts found.")).toBeVisible();
  },
};
export const LoadFailure: Story = {
  args: { direct: true },
  beforeEach: () => {
    mocked(readContacts).mockRejectedValue(new Error("Preview read failure"));
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Retry" })).toBeVisible();
  },
};
export const AddContact: Story = {
  play: async (context) => {
    await Open.play!(context);
    const page = within(context.canvasElement.ownerDocument.body);
    await context.userEvent.click(page.getByRole("button", { name: "Add contact" }));
    const dialog = within(await page.findByRole("dialog", { name: "Add contact" }));
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "Name" })).toBeVisible());
    await expect(
      dialog.getByText("Adding a contact does not create an account or grant access."),
    ).toBeVisible();
  },
};
