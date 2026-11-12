import type { StoryObj } from "@storybook/react-vite";
import { expect, mocked, waitFor, within } from "storybook/test";

import directory from "./contacts.stories";
import { configureContacts } from "./contacts.story-fixtures";
import { saveContact } from "./data/server/contacts.functions";

const meta = {
  ...directory,
  title: "Features/Contacts/Edit contact",
  tags: ["!autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

type Context = Parameters<NonNullable<Story["play"]>>[0];

const open = async ({ canvas, canvasElement, userEvent }: Context) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await canvas.findByRole("button", { name: "Actions for Leah Martin" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Edit contact details" }));
  return within(await page.findByRole("dialog", { name: "Edit contact details" }));
};

const change = async (context: Context) => {
  const dialog = await open(context);
  await context.userEvent.clear(dialog.getByRole("textbox", { name: "Affiliation" }));
  await context.userEvent.type(
    dialog.getByRole("textbox", { name: "Affiliation" }),
    "Community Kitchen",
  );
  return dialog;
};

const submit = async (context: Context) => {
  const dialog = await change(context);
  await context.userEvent.click(dialog.getByRole("button", { name: "Save contact" }));
  return dialog;
};

export const Open: Story = {
  play: async (context) => {
    await open(context);
  },
};
export const Validation: Story = {
  play: async (context) => {
    const dialog = await open(context);
    await context.userEvent.clear(dialog.getByRole("textbox", { name: "Email" }));
    await context.userEvent.type(
      dialog.getByRole("textbox", { name: "Email" }),
      "incomplete-address",
    );
    await context.userEvent.click(dialog.getByRole("button", { name: "Save contact" }));
    await expect(dialog.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(saveContact).not.toHaveBeenCalled();
  },
};
export const Saving: Story = {
  beforeEach: () => {
    mocked(saveContact).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    const dialog = await submit(context);
    await expect(dialog.getByRole("button", { name: "Saving contact…" })).toBeDisabled();
    await context.userEvent.keyboard("{Escape}");
    await expect(dialog.getByRole("form")).toBeVisible();
  },
};
export const SaveFailure: Story = {
  beforeEach: () => {
    mocked(saveContact).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    const dialog = await submit(context);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Your changes are preserved");
    await expect(dialog.getByRole("textbox", { name: "Affiliation" })).toHaveValue(
      "Community Kitchen",
    );
  },
};
export const Saved: Story = {
  play: async (context) => {
    await submit(context);
    await waitFor(() =>
      expect(
        within(context.canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
    await expect(context.canvas.getByText("Community Kitchen")).toBeVisible();
  },
};
export const ResumedDraft: Story = {
  play: async (context) => {
    const dialog = await change(context);
    await context.userEvent.click(
      within(dialog.getByRole("form")).getByRole("button", { name: "Close" }),
    );
    await context.userEvent.click(
      await context.canvas.findByRole("button", { name: "Resume editing" }),
    );
    await expect(
      within(context.canvasElement.ownerDocument.body).getByRole("textbox", {
        name: "Affiliation",
      }),
    ).toHaveValue("Community Kitchen");
  },
};
export const ConcurrentChanges: Story = {
  beforeEach: ({ args }) => {
    mocked(saveContact).mockImplementationOnce(async () => {
      configureContacts(
        args.contacts.map((contact, index) =>
          index === 0
            ? {
                ...contact,
                affiliation: "Neighbourhood Food Network",
                revision: contact.revision + 1,
              }
            : contact,
        ),
      );
      return { status: "conflict" };
    });
  },
  play: async (context) => {
    const dialog = await submit(context);
    await waitFor(() => expect(dialog.getByText("Current saved details")).toBeVisible());
    await expect(dialog.getByText("Neighbourhood Food Network")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Affiliation" })).toHaveValue(
      "Community Kitchen",
    );
    await expect(dialog.getByRole("button", { name: "Save contact" })).toBeDisabled();
  },
};
