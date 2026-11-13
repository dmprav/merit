import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { ContactHistoryEntry } from "@merit/contacts/api";
import { createQueryClient } from "@merit/query";
import type { PageSource } from "@merit/query/contracts";

import { ContactsMessagesProvider } from "../messages";
import { ContactHistory } from "./contact-history";

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

  const read = vi
    .fn<PageSource<ContactHistoryEntry>["read"]>()
    .mockResolvedValueOnce({ entries: [entry(1, "Dana")], nextCursor: "older" })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ entries: [entry(0, "Sam")], nextCursor: null });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ContactsMessagesProvider>
        <ContactHistory
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
  await user.click(screen.getByRole("button", { name: "Load older entries" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("History could not be loaded.");
  expect(screen.getByText("Recorded by Dana")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Recorded by Sam")).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument(),
  );
  expect(read.mock.calls.map((call) => call[0])).toEqual([undefined, "older", "older"]);
});
