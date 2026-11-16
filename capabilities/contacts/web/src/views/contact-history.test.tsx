import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { ContactHistoryEntry } from "@merit/contacts/api";
import { formatTimestamp } from "@merit/i18n/format";
import { createQueryClient } from "@merit/query";
import type { PageSource } from "@merit/query/contracts";

import type { Contact } from "../contracts";
import { ContactsMessagesProvider } from "../messages";
import { ContactHistory } from "./contact-history";

const History = ({ contact }: { contact: Contact }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Contact history for Leah</button>
      <ContactHistory contact={contact} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};

it("loads history only when opened and retries an older page without hiding recorded entries", async () => {
  const contact = {
    id: "contact",
    name: "Leah",
    email: "leah@example.test",
    affiliation: "",
    archived: false,
    revision: 1,
  };

  const entry = (revision: number, actor: string): ContactHistoryEntry => ({
    contactId: contact.id,
    revision,
    actor,
    provenance: { interface: "web" },
    recordedAt: "2026-11-09T10:00:00Z",
    before: null,
    after: contact,
  });

  // Each page depends on the cursor it is asked for; the first older-page read fails.
  let offline = true;
  const read = vi.fn<PageSource<ContactHistoryEntry>["read"]>(async (after) => {
    if (after === undefined) {
      return { entries: [entry(1, "Dana")], nextCursor: "older" };
    }
    if (after !== "older") {
      return { entries: [], nextCursor: null };
    }
    if (offline) {
      offline = false;
      throw new Error("Offline");
    }
    return { entries: [entry(0, "Sam")], nextCursor: null };
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ContactsMessagesProvider>
        <History
          contact={{
            ...contact,
            historySource: { queryKey: ["private", "history", contact.id], read },
          }}
        />
      </ContactsMessagesProvider>
    </QueryClientProvider>,
  );
  expect(read).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Contact history for Leah" }));
  expect(await screen.findByText("Recorded by Dana")).toBeVisible();
  const timestamp = screen.getByText(formatTimestamp("2026-11-09T10:00:00Z", "en-GB"));
  expect(timestamp).toHaveAttribute("datetime", "2026-11-09T10:00:00Z");
  await user.click(screen.getByRole("button", { name: "Load older entries" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("History could not be loaded.");
  expect(screen.getByText("Recorded by Dana")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Recorded by Sam")).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument(),
  );
});

const saved = {
  id: "contact",
  name: "Leah",
  email: "leah@example.test",
  affiliation: "",
  archived: false,
  revision: 1,
};

it("shows changed fields, removed values and status while keeping unchanged saved values in a disclosure", async () => {
  render(
    <ContactsMessagesProvider>
      <History
        contact={{
          ...saved,
          history: [
            {
              contactId: saved.id,
              revision: 1,
              actor: "Dana",
              provenance: { interface: "mcp", clientId: "example" },
              recordedAt: "2026-11-09T10:00:00Z",
              before: saved,
              after: { ...saved, email: "", affiliation: "Kitchen", archived: true },
            },
          ],
        }}
      />
    </ContactsMessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Contact history for Leah" }));
  const dialog = within(screen.getByRole("dialog", { name: "Contact history" }));
  expect(dialog.getByText("via MCP client example")).toBeVisible();
  const changes = within(dialog.getByText("Removed").closest("dl")!);
  expect(changes.getAllByRole("group", { name: "Before" })[0]).toHaveTextContent(
    "leah@example.test",
  );
  expect(changes.getAllByRole("group", { name: "After" })[0]).toHaveTextContent("Removed");
  expect(changes.getByText("Not provided")).toBeVisible();
  expect(changes.getByText("Kitchen")).toBeVisible();
  expect(changes.getByText("Active")).toBeVisible();
  expect(changes.getByText("Archived")).toBeVisible();
  expect(changes.queryByText("Name")).not.toBeInTheDocument();
  expect(dialog.getByText("Name")).not.toBeVisible();
  await user.click(dialog.getByText("Saved contact details"));
  expect(dialog.getByText("Name")).toBeVisible();
});

it("labels creation and keeps missing saved fields explicit", async () => {
  render(
    <ContactsMessagesProvider>
      <History
        contact={{
          ...saved,
          history: [
            {
              contactId: saved.id,
              revision: 0,
              actor: null,
              provenance: null,
              recordedAt: "2026-11-09T10:00:00Z",
              before: null,
              after: saved,
            },
          ],
        }}
      />
    </ContactsMessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Contact history for Leah" }));
  expect(screen.getByText("Contact created")).toBeVisible();
  expect(screen.getByText("Recorded by Unknown person")).toBeVisible();
  expect(screen.getByText("Not provided")).toBeVisible();
  expect(screen.getByText("leah@example.test")).toBeVisible();
  expect(screen.queryByText("Saved contact details")).not.toBeInTheDocument();
});

it("presents restoration as Archived to Active", async () => {
  render(
    <ContactsMessagesProvider>
      <History
        contact={{
          ...saved,
          history: [
            {
              contactId: saved.id,
              revision: 2,
              actor: "Dana",
              provenance: null,
              recordedAt: "2026-11-09T10:00:00Z",
              before: { ...saved, archived: true },
              after: saved,
            },
          ],
        }}
      />
    </ContactsMessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Contact history for Leah" }));
  const changes = within(screen.getByText("Archived").closest("dl")!);
  expect(changes.getByText("Status")).toBeVisible();
  expect(changes.getByText("Active")).toBeVisible();
  expect(changes.queryByText("Name")).not.toBeInTheDocument();
});

it("explains when an opened history source has no recorded changes", async () => {
  const read = vi
    .fn<PageSource<ContactHistoryEntry>["read"]>()
    .mockResolvedValue({ entries: [], nextCursor: null });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ContactsMessagesProvider>
        <History
          contact={{ ...saved, historySource: { queryKey: ["empty-contact-history"], read } }}
        />
      </ContactsMessagesProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Contact history for Leah" }));
  expect(await screen.findByText("No recorded changes.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument();
});
