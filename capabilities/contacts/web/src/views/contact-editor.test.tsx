import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import type { Contact, ContactsData } from "../contracts";
import { ContactsMessagesProvider, en } from "../messages";
import { ContactEditor } from "./contact-editor";

it("translates form and email validation, preserves input, and saves after correction", async () => {
  const messages = {
    contacts: { ...en, validation: { nameOrEmailRequired: "Translated contact requirement" } },
    common: { validation: { email: "Translated email requirement" } },
  };
  const save = vi.fn<ContactsData["save"]>().mockResolvedValue({ status: "unavailable" });
  render(
    <MessagesProvider messages={messages}>
      <ContactEditor
        workspaceSlug="alder"
        data={{ contacts: [], readFailed: false, save, refresh: vi.fn(), refreshCurrent: vi.fn() }}
        draftStore={{
          get: vi.fn(),
          has: () => false,
          set: vi.fn(),
          unavailable: false,
          ready: true,
          status: "memory",
        }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
        onPending={vi.fn()}
      />
    </MessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Save contact" }));

  expect(await screen.findByText("Translated contact requirement")).toBeVisible();
  expect(save).not.toHaveBeenCalled();

  const email = screen.getByRole("textbox", { name: "Email" });
  await user.type(email, "invalid");
  await user.click(screen.getByRole("button", { name: "Save contact" }));

  expect(email).toHaveAccessibleDescription("Translated email requirement");
  expect(email).toHaveValue("invalid");
  expect(save).not.toHaveBeenCalled();

  await user.clear(email);
  await user.type(email, "sam@example.test");
  await user.click(screen.getByRole("button", { name: "Save contact" }));

  expect(save).toHaveBeenCalledOnce();
  expect(email).not.toHaveAttribute("aria-invalid", "true");
});

it("preserves a known conflict and its draft when refreshing through the injected adapter fails", async () => {
  const contact: Contact = {
    id: "sam",
    name: "Sam",
    email: "",
    affiliation: "",
    revision: 2,
    archived: false,
  };
  const data: ContactsData = {
    contacts: [contact],
    readFailed: false,
    save: vi.fn().mockResolvedValue({ status: "conflict" }),
    refresh: vi.fn(),
    refreshCurrent: vi.fn().mockRejectedValue(new Error("Offline")),
  };
  const setDraft = vi.fn();
  const onSaved = vi.fn();
  render(
    <ContactEditor
      workspaceSlug="alder"
      contact={contact}
      data={data}
      draftStore={{
        get: vi.fn(),
        has: () => false,
        set: setDraft,
        unavailable: false,
        ready: true,
        status: "memory",
      }}
      onSaved={onSaved}
      onClose={vi.fn()}
      onPending={vi.fn()}
    />,
    { wrapper: ContactsMessagesProvider },
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Name" }), " Taylor");
  await user.click(screen.getByRole("button", { name: "Save contact" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("changed");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sam Taylor");
  expect(data.save).toHaveBeenCalledWith({
    workspaceSlug: "alder",
    contactId: "sam",
    action: "update",
    expectedContactRevision: 2,
    details: { name: "Sam Taylor", email: "", affiliation: "" },
  });
  expect(data.refreshCurrent).toHaveBeenCalledOnce();
  expect(setDraft).not.toHaveBeenCalledWith("alder", "sam", undefined);
  expect(onSaved).not.toHaveBeenCalled();
});
