import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";
import type { PageSource } from "@merit/query/contracts";

import type { Contact, ContactApplication, ContactsData } from "../contracts";
import { ContactsMessagesProvider } from "../messages";
import { ContactsDirectory } from "./contacts-directory";

const leah: Contact = {
  id: "leah",
  name: "Leah",
  email: "leah@example.test",
  affiliation: "Kitchen",
  archived: false,
  revision: 1,
  applicationTitles: Array.from({ length: 30 }, (_, index) => `Community programme ${index + 1}`),
  history: [
    {
      contactId: "leah",
      revision: 1,
      actor: "Dana",
      provenance: { interface: "web" },
      recordedAt: "2026-11-09T10:00:00Z",
      before: null,
      after: { name: "Leah", email: "leah@example.test", affiliation: "Kitchen", archived: false },
    },
  ],
};
const sam: Contact = {
  id: "sam",
  name: "Sam",
  email: "",
  affiliation: "",
  archived: true,
  revision: 0,
};

const show = (contacts: Contact[] = [leah, sam]) => {
  const data: ContactsData = {
    contacts,
    readFailed: false,
    save: vi.fn(),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  };

  const client = createQueryClient();

  const page = (records: Contact[]) => (
    <QueryClientProvider client={client}>
      <ContactsMessagesProvider>
        <ContactsDirectory
          workspaceSlug="alder"
          data={data}
          contacts={records}
          renderApplicationLink={(item, children) => (
            <a href={`/applications/${item.publicId}`}>{children}</a>
          )}
        />
      </ContactsMessagesProvider>
    </QueryClientProvider>
  );

  const view = render(page(contacts));
  return { update: (records: Contact[]) => view.rerender(page(records)) };
};

it("keeps names-only application counts noninteractive while preserving title search", async () => {
  show();
  const user = userEvent.setup();
  expect(screen.getByText("30 applications")).toBeVisible();
  expect(screen.queryByRole("button", { name: "30 applications" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.type(screen.getByRole("searchbox", { name: "Find a contact" }), "programme 30");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("table")).toHaveTextContent("Leah");
  expect(screen.getByText("1 contact")).toHaveAttribute("role", "status");
});

it("loads real application links only after opening and retries more without losing earlier links", async () => {
  const read = vi
    .fn<PageSource<ContactApplication>["read"]>()
    .mockResolvedValueOnce({
      entries: [
        {
          publicId: "k7m2p9x4n6rt",
          title: "Community programme",
          roundTitle: "Community grants 2025",
          relationships: ["applicant_contact", "review_requested", "assessment_recorded"],
        },
      ],
      nextCursor: "k7m2p9x4n6rt",
    })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({
      entries: [
        {
          publicId: "m7m2p9x4n6rt",
          title: "Community programme",
          roundTitle: "Community grants 2026",
          relationships: ["assessment_recorded"],
        },
      ],
      nextCursor: null,
    });
  show([{ ...leah, applicationsSource: { queryKey: ["contact-applications"], read } }]);
  expect(read).not.toHaveBeenCalled();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "30 applications" });
  await user.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "Related applications: Leah" }));
  expect(await dialog.findByRole("link", { name: /Community programme/ })).toHaveAttribute(
    "href",
    "/applications/k7m2p9x4n6rt",
  );
  expect(dialog.getByRole("link")).toHaveAccessibleName(
    "Community programme Community grants 2025 Contact for the applicant · Asked to review · Provided an assessment",
  );
  await user.click(dialog.getByRole("button", { name: "Load more applications" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("Applications could not be loaded.");
  expect(dialog.getByRole("link")).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(dialog.getAllByRole("link", { name: /Community programme/ })).toHaveLength(2),
  );
  expect(dialog.getAllByRole("link")[1]).toHaveAttribute("href", "/applications/m7m2p9x4n6rt");
  expect(dialog.queryByRole("button", { name: "Load more applications" })).not.toBeInTheDocument();
  expect(read.mock.calls.map((call) => call[0])).toEqual([
    undefined,
    "k7m2p9x4n6rt",
    "k7m2p9x4n6rt",
  ]);
  dialog.getAllByRole("link")[0]!.focus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps the initial failed read's retry mounted and focused until the real page source settles", async () => {
  let reject!: (reason: Error) => void;
  let resolve!: (page: { entries: ContactApplication[]; nextCursor: null }) => void;
  const read = vi
    .fn<PageSource<ContactApplication>["read"]>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  show([{ ...leah, applicationsSource: { queryKey: ["empty-applications"], read } }]);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "30 applications" }));
  expect(await screen.findByText("Loading applications…")).toHaveAttribute("role", "status");
  reject(new Error("Offline"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Applications could not be loaded.");
  const retry = screen.getByRole("button", { name: "Try again" });
  await user.click(retry);
  expect(screen.getByRole("button", { name: "Try again" })).toBe(retry);
  expect(retry).toHaveAttribute("aria-disabled", "true");
  expect(retry).toHaveFocus();
  act(() => resolve({ entries: [], nextCursor: null }));
  expect(await screen.findByText("No related applications")).toBeVisible();
});

it("removes previously loaded application links when the next page denies access", async () => {
  const read = vi
    .fn<PageSource<ContactApplication>["read"]>()
    .mockResolvedValueOnce({
      entries: [
        {
          publicId: "k7m2p9x4n6rt",
          title: "Private application",
          roundTitle: "Private round",
          relationships: ["review_requested"],
        },
      ],
      nextCursor: "next",
    })
    .mockResolvedValueOnce(null);
  show([{ ...leah, applicationsSource: { queryKey: ["denied-applications"], read } }]);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "30 applications" }));
  expect(await screen.findByRole("link", { name: /Private application/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Load more applications" }));
  expect(await screen.findByText("These applications are no longer available.")).toBeVisible();
  expect(screen.queryByRole("link", { name: /Private application/ })).not.toBeInTheDocument();
});

it("returns to active contacts through the removable Archived chip and resets search with filters", async () => {
  show();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: /Status/ }));
  await user.click(screen.getByRole("option", { name: "Archived" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Status Archived" })).toHaveFocus(),
  );
  await user.keyboard("{Escape}");
  expect(await screen.findByRole("table")).toHaveTextContent("Sam");
  expect(screen.getByRole("img", { name: "No related applications" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Remove Archived filter" }));
  expect(screen.getByRole("table")).toHaveTextContent("Leah");
  expect(screen.getByRole("button", { name: "Filter" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.type(screen.getByRole("searchbox"), "missing");
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  await user.keyboard("{Escape}");
  expect(await screen.findByRole("table")).toHaveTextContent("Leah");
});

it("keeps history open across directory updates and restores focus to the same row menu", async () => {
  const { update } = show([leah, { ...sam, archived: false }]);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Actions for Leah" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Contact history" }));
  expect(screen.getByRole("dialog", { name: "Contact history" })).toBeVisible();
  update([
    { ...leah, name: "Leah Martin" },
    { ...sam, archived: false },
  ]);
  expect(screen.getByRole("dialog", { name: "Contact history" })).toHaveTextContent("Leah Martin");
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole("button", { name: "Actions for Leah Martin" })).toBe(trigger);
  await user.click(screen.getByRole("button", { name: "Actions for Sam" }));
  expect(screen.queryByRole("menuitem", { name: "Contact history" })).not.toBeInTheDocument();
});
