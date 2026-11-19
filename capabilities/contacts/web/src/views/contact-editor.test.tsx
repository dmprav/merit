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

it("saves contact updates directly without revision conflict blocking even when revision advances", async () => {
  const contact: Contact = {
    id: "sam",
    name: "Sam",
    email: "",
    affiliation: "",
    revision: 2,
    archived: false,
  };
  const updated: Contact = { ...contact, revision: 4, affiliation: "External update" };
  const saved: Contact = { ...updated, name: "Sam Taylor", revision: 5 };
  const data: ContactsData = {
    contacts: [updated],
    readFailed: false,
    save: vi.fn().mockResolvedValue({ status: "ok", contact: saved }),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
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
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Name" }), " Taylor");
  await user.click(screen.getByRole("button", { name: "Save contact" }));

  expect(data.save).toHaveBeenCalledWith({
    workspaceSlug: "alder",
    contactId: "sam",
    action: "update",
    details: { name: "Sam Taylor", email: "", affiliation: "" },
  });
  expect(onSaved).toHaveBeenCalledWith(saved);
  expect(setDraft).toHaveBeenLastCalledWith("alder", "sam", undefined);
});

it("shows RetainedDraftNotice with copy/discard when the contact disappears before saving", async () => {
  const contact: Contact = {
    id: "sam",
    name: "Sam",
    email: "sam@example.test",
    affiliation: "Alder",
    revision: 2,
    archived: false,
  };
  const data: ContactsData = {
    contacts: [],
    readFailed: false,
    save: vi.fn(),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  };
  const onClose = vi.fn();
  const setDraft = vi.fn();
  render(
    <ContactEditor
      workspaceSlug="alder"
      contact={contact}
      data={data}
      draftStore={{
        get: () => ({
          id: "sam",
          baseline: 2,
          value: { name: "Sam Updated", email: "sam@example.test", affiliation: "Alder" },
        }),
        has: () => true,
        set: setDraft,
        unavailable: false,
        ready: true,
        status: "memory",
      }}
      onSaved={vi.fn()}
      onClose={onClose}
      onPending={vi.fn()}
    />,
    { wrapper: ContactsMessagesProvider },
  );

  const user = userEvent.setup();
  const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  expect(screen.getByRole("region", { name: "Unsaved contact details" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(writeText).toHaveBeenCalledWith("Sam Updated\nsam@example.test\nAlder");
  await user.click(screen.getByRole("button", { name: "Discard draft" }));
  expect(setDraft).toHaveBeenCalledWith("alder", "sam", undefined);
  expect(onClose).toHaveBeenCalledOnce();
});
