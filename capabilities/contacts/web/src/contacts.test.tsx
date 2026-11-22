import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";
import { Toasts } from "@merit/ui/toast";

import { ContactPicker, ContactsDirectory } from "./contacts";
import type { ContactsSource } from "./contracts";
import { contactsOptions } from "./data/queries";
import { ContactDrafts } from "./drafts";
import { ContactsMessagesProvider } from "./messages";
import { ContactsProvider } from "./provider";

const read = vi.fn<ContactsSource["read"]>();
const save = vi.fn<ContactsSource["save"]>();
const source: ContactsSource = {
  scope: (workspaceSlug) => ["grant-work", workspaceSlug],
  read,
  save,
};

beforeEach(() => {
  read.mockReset();
  save.mockReset();
});

afterEach(() => vi.useRealTimers());

const renderApplicationLink: ComponentProps<typeof ContactsDirectory>["renderApplicationLink"] = (
  item,
  children,
  { tab },
) => <a href={`/applications/${item.publicId}${tab ? `?tab=${tab}` : ""}`}>{children}</a>;

const show = (ui: ReactNode, client = createQueryClient()) => {
  render(
    <QueryClientProvider client={client}>
      <ContactsMessagesProvider>
        <ContactsProvider source={source}>
          {ui}
          <Toasts />
        </ContactsProvider>
      </ContactsMessagesProvider>
    </QueryClientProvider>,
  );
  return client;
};

const sam = (archived = false) => ({
  id: "sam",
  name: "Sam Morgan",
  email: "sam@example.test",
  affiliation: "",
  archived,
  revision: 0,
  applicationTitles: [],
});

/** Fake timers that keep running, so a failed refresh can exhaust its quiet retries on demand. */
const useRetryTimers = () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
};

const exhaustQuietRetries = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });

const showArchived = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(await screen.findByRole("button", { name: /Status/ }));
  await user.click(await screen.findByRole("option", { name: "Archived" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Status/ })).toHaveFocus());
  await user.keyboard("{Escape}");
  // The closing filter popover blocks the page until its exit motion ends.
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

it.each([false, true])(
  "retries a failed archive-state change and focuses Add contact when the row disappears (archived: %s)",
  async (archived) => {
    const contact = sam(archived);
    const saved = { ...contact, organizationId: "alder", archived: !archived, revision: 1 };
    const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
    read.mockResolvedValue(response);
    save.mockResolvedValueOnce({ status: "unavailable" });
    const user = userEvent.setup();
    const client = show(
      <ContactsDirectory
        workspaceSlug="alder"
        contacts={[contact]}
        renderApplicationLink={renderApplicationLink}
      />,
    );
    if (archived) {
      await showArchived(user);
    }
    await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: archived ? "Restore" : "Archive" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save.");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Sam Morgan" })).toHaveFocus(),
    );
    expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Sam Morgan");
    expect(save).toHaveBeenCalledTimes(1);

    read.mockResolvedValue({ ...response, contacts: [saved] });
    save.mockResolvedValueOnce({ status: "ok", contact: saved });
    await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: archived ? "Restore" : "Archive" }),
    );

    expect(
      await screen.findByText(archived ? "No archived contacts." : "No active contacts."),
    ).toBeVisible();
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add contact" })).toHaveFocus());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.lastCall?.[0]).toEqual({
      workspaceSlug: "alder",
      contactId: "sam",
      action: archived ? "restore" : "archive",
      expectedContactRevision: 0,
    });
    client.clear();
  },
);

it("keeps a contact available and links to the review work that prevents archiving", async () => {
  const contact = { ...sam(), applicationTitles: ["Workshop Saturdays"] };
  read.mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [contact] });
  save.mockResolvedValueOnce({
    status: "invalid",
    error: "outstanding_requests",
    outstanding: [{ publicId: "workshop", title: "Workshop Saturdays" }],
  });
  const user = userEvent.setup();
  const client = show(
    <ContactsDirectory
      workspaceSlug="alder"
      contacts={[contact]}
      renderApplicationLink={renderApplicationLink}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));

  expect(
    await screen.findByText(
      "Resolve these outstanding review requests before archiving this contact:",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toHaveAttribute(
    "href",
    "/applications/workshop?tab=reviews",
  );
  expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Sam Morgan");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Sam Morgan" })).toHaveFocus(),
  );
  expect(save).toHaveBeenCalledOnce();
  client.clear();
});

it.each([
  ["conflict", false],
  ["ok", false],
  ["conflict", true],
  ["ok", true],
] as const)(
  "preserves a %s result when refresh fails and retries only the read (archived: %s)",
  async (status, archived) => {
    const contact = sam(archived);
    const user = useRetryTimers();
    const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
    read.mockResolvedValue(response);
    save.mockImplementation(async () => {
      read.mockRejectedValue(new Error("Offline"));
      return status === "conflict"
        ? { status }
        : {
            status,
            contact: { ...contact, organizationId: "alder", archived: !archived, revision: 1 },
          };
    });
    const client = show(
      <ContactsDirectory
        workspaceSlug="alder"
        contacts={[contact]}
        renderApplicationLink={renderApplicationLink}
      />,
    );

    if (archived) {
      await showArchived(user);
    }
    await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: archived ? "Restore" : "Archive" }),
    );

    await exhaustQuietRetries();
    const warning = await screen.findByRole("alertdialog", {
      name:
        status === "conflict"
          ? "The latest contacts could not be loaded."
          : "Saved, but the latest contacts could not be loaded.",
    });
    if (status === "conflict") {
      expect(screen.getByText(/This work changed while you were editing/)).toBeVisible();
    }

    read.mockResolvedValue(response);
    await user.click(within(warning).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.lastCall?.[0]).toEqual({
      workspaceSlug: "alder",
      contactId: "sam",
      action: archived ? "restore" : "archive",
      expectedContactRevision: 0,
    });
    if (status === "conflict") {
      expect(screen.getByText(/This work changed while you were editing/)).toBeVisible();
    }
    client.clear();
  },
);

it("clears a committed contact draft, restores focus, and retries a failed refresh without saving again", async () => {
  const contact = { ...sam(), revision: 2 };
  const saved = { ...contact, organizationId: "alder", name: "Sam Taylor", revision: 3 };
  const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
  read.mockResolvedValue(response);
  save.mockImplementation(async () => {
    read.mockRejectedValue(new Error("Offline"));
    return { status: "ok", contact: saved };
  });
  const user = useRetryTimers();
  const client = show(
    <ContactsDirectory
      workspaceSlug="alder"
      contacts={[contact]}
      renderApplicationLink={renderApplicationLink}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  await user.clear(screen.getByRole("textbox", { name: "Name" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Sam Taylor");
  await user.click(await screen.findByRole("button", { name: "Save contact" }));

  await exhaustQuietRetries();
  const warning = await screen.findByRole("alertdialog", {
    name: "Saved, but the latest contacts could not be loaded.",
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Resume editing" })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Sam Taylor" })).toHaveFocus(),
  );
  expect(client.getQueryData(contactsOptions("alder", source).queryKey)).toMatchObject({
    contacts: [saved],
  });

  read.mockResolvedValue({ ...response, contacts: [saved] });
  await user.click(within(warning).getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("alertdialog", {
        name: "Saved, but the latest contacts could not be loaded.",
      }),
    ).not.toBeInTheDocument(),
  );
  expect(save).toHaveBeenCalledOnce();

  await user.click(await screen.findByRole("button", { name: "Actions for Sam Taylor" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sam Taylor");
  client.clear();
});

it("keeps the parent picker protected while creating a contact and releases it on cancel or save", async () => {
  const user = userEvent.setup();
  const onEditorOpenChange = vi.fn();
  const onChange = vi.fn();
  read.mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [] });
  save.mockResolvedValue({
    status: "ok",
    contact: {
      id: "leah",
      organizationId: "alder",
      name: "Leah Martin",
      email: "leah@example.test",
      affiliation: "",
      archived: false,
      revision: 0,
    },
  });
  show(
    <ContactPicker
      direct
      workspaceSlug="alder"
      value={null}
      label="Applicant contact"
      onChange={onChange}
      onEditorOpenChange={onEditorOpenChange}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Add contact" }));

  expect(onEditorOpenChange).toHaveBeenLastCalledWith(true);

  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  expect(onEditorOpenChange).toHaveBeenLastCalledWith(false);

  await user.click(await screen.findByRole("button", { name: "Add contact" }));
  const dialog = within(screen.getByRole("dialog", { name: "Add contact" }));
  await user.click(dialog.getByRole("button", { name: "Save contact" }));

  expect(onEditorOpenChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("dialog", { name: "Add contact" })).toBeVisible();

  await user.type(dialog.getByRole("textbox", { name: "Name" }), "Leah Martin");
  await user.type(dialog.getByRole("textbox", { name: "Email" }), "leah@example.test");
  await user.click(dialog.getByRole("button", { name: "Save contact" }));

  await waitFor(() => expect(onChange).toHaveBeenCalledWith("leah"));
  expect(save.mock.lastCall?.[0]).toEqual({
    workspaceSlug: "alder",
    contactId: expect.any(String) as unknown,
    action: "create",
    details: { name: "Leah Martin", email: "leah@example.test", affiliation: "" },
  });
  expect(onEditorOpenChange).toHaveBeenLastCalledWith(false);
});

it("retains invalid contact drafts across close and reload, then discards explicitly", async () => {
  read.mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [] });
  const page = (
    <ContactDrafts scope="contact-draft-test">
      <ContactsDirectory
        workspaceSlug="alder"
        contacts={[]}
        renderApplicationLink={renderApplicationLink}
      />
    </ContactDrafts>
  );

  const user = userEvent.setup();
  const first = render(
    <QueryClientProvider client={createQueryClient()}>
      <ContactsMessagesProvider>
        <ContactsProvider source={source}>{page}</ContactsProvider>
      </ContactsMessagesProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Add contact" }));
  await user.type(screen.getByRole("textbox", { name: "Email" }), "unfinished@");
  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  expect(await screen.findByRole("button", { name: "Resume contact" })).toBeVisible();

  first.unmount();
  show(page);
  await user.click(await screen.findByRole("button", { name: "Resume contact" }));

  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("unfinished@");

  await user.click(await screen.findByRole("button", { name: "Discard draft" }));
  await user.click(await screen.findByRole("button", { name: "Add contact" }));

  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");
});

it("resumes an edited contact from its row and blocks dismissal while it saves", async () => {
  const contact = { ...sam(), id: "contact-test", name: "Sam", email: "", revision: 4 };
  read.mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [contact] });
  let resolve!: (value: Awaited<ReturnType<ContactsSource["save"]>>) => void;
  save.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  show(
    <ContactDrafts>
      <ContactsDirectory
        workspaceSlug="alder"
        contacts={[contact]}
        renderApplicationLink={renderApplicationLink}
      />
    </ContactDrafts>,
  );
  await user.click(await screen.findByRole("button", { name: "Actions for Sam" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), " Taylor");
  await user.keyboard("{Escape}");
  const actions = await screen.findByRole("button", { name: "Actions for Sam" });
  expect(actions).toHaveAttribute("data-draft", "true");
  expect(actions).toHaveAccessibleDescription("Resume editing");
  expect(document.querySelectorAll("[data-draft]")).toHaveLength(1);
  await waitFor(() => expect(actions).toHaveFocus());
  await user.click(actions);
  await user.click(await screen.findByRole("menuitem", { name: "Resume editing" }));
  await user.click(await screen.findByRole("button", { name: "Save contact" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Saving contact…" })).toBeDisabled(),
  );

  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog")).toBeVisible();
  expect(save.mock.lastCall?.[0]).toEqual(
    expect.objectContaining({
      action: "update",
      contactId: "contact-test",
      details: { name: "Sam Taylor", email: "", affiliation: "" },
    }),
  );

  resolve({ status: "unavailable" });

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sam Taylor");
});
