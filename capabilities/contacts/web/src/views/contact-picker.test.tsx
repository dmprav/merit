import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { Contact, ContactsData } from "../contracts";
import { ContactsMessagesProvider } from "../messages";
import { ContactPicker } from "./contact-picker";

const emailOnly = {
  id: "new-contact",
  organizationId: "alder",
  name: "",
  email: "reviewer@example.test",
  affiliation: "",
  archived: false,
  revision: 0,
};

const showPicker = (
  direct: boolean,
  {
    contacts = [
      { ...emailOnly, id: "current", name: "Current contact", email: "" },
      { ...emailOnly, id: "other", name: "Another contact", email: "" },
      { ...emailOnly, id: "existing-email-only" },
    ],
    ...props
  }: Partial<
    Pick<
      ComponentProps<typeof ContactPicker>,
      "value" | "isEligible" | "isRequired" | "disabledContactIds" | "emptySelectionLabel"
    >
  > & { contacts?: Contact[] } = {},
) => {
  const onChange = vi.fn();
  const save = vi.fn<ContactsData["save"]>().mockResolvedValue({
    status: "ok",
    contact: emailOnly,
  });
  const user = userEvent.setup();
  render(
    <ContactPicker
      data={{
        contacts,
        readFailed: false,
        save,
        refresh: vi.fn(),
        refreshCurrent: vi.fn(),
      }}
      direct={direct}
      isRequired
      workspaceSlug="alder"
      value="current"
      label="Contact"
      onChange={onChange}
      {...props}
    />,
    { wrapper: ContactsMessagesProvider },
  );

  const openChoices = async () => {
    if (!direct) {
      await user.click(screen.getByRole("button", { name: /Contact$/ }));
    }
  };

  const createEmailContact = async () => {
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add contact" }));
    await user.type(dialog.getByRole("textbox", { name: "Email" }), emailOnly.email);
    await user.click(dialog.getByRole("button", { name: "Save contact" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add contact" })).not.toBeInTheDocument(),
    );
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        details: { name: "", email: emailOnly.email, affiliation: "" },
      }),
    );
  };

  return { user, onChange, openChoices, createEmailContact };
};

it.each([true, false])(
  "preserves the selection when a newly saved contact is ineligible (direct: %s)",
  async (direct) => {
    const { user, onChange, openChoices, createEmailContact } = showPicker(direct, {
      isEligible: (contact) => Boolean(contact.name.trim()),
    });
    await openChoices();
    expect(screen.getByRole("option", { name: emailOnly.email })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await createEmailContact();

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Contact saved, but it cannot be selected here.",
    );

    await openChoices();
    expect(screen.getByRole("option", { name: "Current contact" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("option", { name: "Another contact" }));

    expect(onChange).toHaveBeenCalledWith("other");
    expect(screen.queryByText(/Contact saved, but/)).not.toBeInTheDocument();
  },
);

it.each([true, false])(
  "keeps an archived selection visible while preventing unavailable choices (direct: %s)",
  async (direct) => {
    const { user, onChange, openChoices } = showPicker(direct, {
      contacts: [
        { ...emailOnly, id: "current", name: "Current contact", archived: true },
        { ...emailOnly, id: "hidden", name: "Hidden contact", archived: true },
        { ...emailOnly, id: "other", name: "Another contact" },
      ],
      disabledContactIds: ["other"],
    });
    await openChoices();

    const current = screen.getByRole("option", { name: /Current contact.*Archived/ });
    expect(current).toHaveAttribute("aria-selected", "true");
    expect(current).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("option", { name: /Hidden contact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "No contact" })).not.toBeInTheDocument();
    const other = screen.getByRole("option", { name: /Another contact/ });
    expect(other).toHaveAttribute("aria-disabled", "true");
    await user.click(other);
    expect(onChange).not.toHaveBeenCalled();
  },
);

it.each([true, false])(
  "clears an optional selection using the caller's empty label (direct: %s)",
  async (direct) => {
    const { user, onChange, openChoices } = showPicker(direct, {
      isRequired: false,
      emptySelectionLabel: "No reviewer",
    });
    await openChoices();
    await user.click(screen.getByRole("option", { name: "No reviewer" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  },
);

it.each([true, false])(
  "represents an empty optional selection with the default label (direct: %s)",
  async (direct) => {
    const { user, onChange, openChoices } = showPicker(direct, {
      value: null,
      isRequired: false,
    });
    await openChoices();
    expect(screen.getByRole("option", { name: "No contact" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("option", { name: "Another contact" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("other");
  },
);

it.each([true, false])(
  "selects a newly saved email-only contact when the caller permits it (direct: %s)",
  async (direct) => {
    const { onChange, openChoices, createEmailContact } = showPicker(direct);
    await openChoices();
    await createEmailContact();

    expect(onChange).toHaveBeenCalledExactlyOnceWith(emailOnly.id);
    expect(screen.queryByText(/Contact saved, but/)).not.toBeInTheDocument();
  },
);
