import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { renderWithRouter } from "../../../tests/render-with-router";
import { WebMessagesProvider } from "../../app/messages";
import { applicationOptions, roundsOptions } from "../grantmaking/data/queries";
import { teamOptions } from "../team/data/queries";
import { workspaceOptions } from "../workspace/data/queries";
import { ContactPicker, ContactsDirectory, type Contact } from "./contacts";
import { contactsOptions } from "./data/queries";
import { readContacts, saveContact } from "./data/server/contacts.functions";

vi.mock("./data/server/contacts.functions", () => ({
  readContacts: vi.fn(),
  saveContact: vi.fn(),
}));
vi.mock("../grantmaking/data/server/funding-round.functions", () => ({}));
vi.mock("../team/data/server/team.functions", () => ({}));
vi.mock("../workspace/data/server/workspace.functions", () => ({}));

beforeEach(() => {
  vi.mocked(readContacts).mockReset();
  vi.mocked(saveContact).mockReset();
});

it.each([false, true])(
  "retries a failed archive-state change and focuses Add contact when the row disappears (archived: %s)",
  async (archived) => {
    const contact = {
      id: "sam",
      name: "Sam Morgan",
      email: "sam@example.test",
      affiliation: "",
      archived,
      revision: 0,
      applicationTitles: [],
      history: [],
    };
    const saved = { ...contact, organizationId: "alder", archived: !archived, revision: 1 };
    const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
    const client = createQueryClient();
    vi.mocked(readContacts).mockResolvedValue(response);
    vi.mocked(saveContact).mockResolvedValueOnce({ status: "unavailable" });
    const { user } = await renderWithRouter(
      <QueryClientProvider client={client}>
        <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
      </QueryClientProvider>,
    );
    if (archived) {
      await user.click(screen.getByRole("button", { name: /Status/ }));
      await user.click(screen.getByRole("option", { name: "Archived" }));
    }
    await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(screen.getByRole("menuitem", { name: archived ? "Restore" : "Archive" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save.");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Sam Morgan" })).toHaveFocus(),
    );
    expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Sam Morgan");
    expect(saveContact).toHaveBeenCalledTimes(1);

    vi.mocked(readContacts).mockResolvedValue({ ...response, contacts: [saved] });
    vi.mocked(saveContact).mockResolvedValueOnce({ status: "ok", contact: saved });
    await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(screen.getByRole("menuitem", { name: archived ? "Restore" : "Archive" }));

    expect(
      await screen.findByText(archived ? "No archived contacts." : "No active contacts."),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add contact" })).toHaveFocus());
    expect(saveContact).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveContact).mock.lastCall?.[0]).toEqual({
      data: {
        workspaceSlug: "alder",
        contactId: "sam",
        action: archived ? "restore" : "archive",
        expectedContactRevision: 0,
      },
    });
    client.clear();
  },
);

it("keeps a contact available and links to the review work that prevents archiving", async () => {
  const contact = {
    id: "sam",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "",
    archived: false,
    revision: 0,
    applicationTitles: ["Workshop Saturdays"],
    history: [],
  };
  const client = createQueryClient();
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [contact],
  });
  vi.mocked(saveContact).mockResolvedValueOnce({
    status: "invalid",
    error: "outstanding_requests",
    outstanding: [{ publicId: "workshop", title: "Workshop Saturdays" }],
  });
  const { user } = await renderWithRouter(
    <QueryClientProvider client={client}>
      <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
    </QueryClientProvider>,
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
    "/app/alder/applications/workshop?tab=reviews",
  );
  expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Sam Morgan");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Sam Morgan" })).toHaveFocus(),
  );
  expect(saveContact).toHaveBeenCalledOnce();
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
    const contact = {
      id: "sam",
      name: "Sam Morgan",
      email: "sam@example.test",
      affiliation: "",
      archived,
      revision: 0,
      applicationTitles: [],
      history: [],
    };
    const client = createQueryClient();
    const user = userEvent.setup();
    const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
    vi.mocked(readContacts).mockResolvedValue(response);
    vi.mocked(saveContact).mockImplementation(async () => {
      vi.mocked(readContacts).mockRejectedValue(new Error("Offline"));
      return status === "conflict"
        ? { status }
        : {
            status,
            contact: { ...contact, organizationId: "alder", archived: !archived, revision: 1 },
          };
    });
    render(
      <QueryClientProvider client={client}>
        <WebMessagesProvider>
          <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
        </WebMessagesProvider>
      </QueryClientProvider>,
    );

    if (archived) {
      await user.click(await screen.findByRole("button", { name: /Status/ }));
      await user.click(await screen.findByRole("option", { name: "Archived" }));
    }
    await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: archived ? "Restore" : "Archive" }),
    );

    await screen.findByText(/latest information could not be loaded/);
    if (status === "conflict") {
      expect(screen.getByText(/This work changed while you were editing/)).toBeVisible();
      expect(screen.queryByText(/Saved, but/)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(/Saved, but/)).toBeVisible();
    }

    vi.mocked(readContacts).mockResolvedValue(response);
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.queryByText(/latest information could not be loaded/)).not.toBeInTheDocument(),
    );
    expect(saveContact).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveContact).mock.lastCall?.[0]).toEqual({
      data: {
        workspaceSlug: "alder",
        contactId: "sam",
        action: archived ? "restore" : "archive",
        expectedContactRevision: 0,
      },
    });
    if (status === "conflict") {
      expect(screen.getByText(/This work changed while you were editing/)).toBeVisible();
    }
    client.clear();
  },
);

it("clears a committed contact draft, restores focus, and retries a failed refresh without saving again", async () => {
  const contact = {
    id: "sam",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "",
    archived: false,
    revision: 2,
    applicationTitles: [],
    history: [],
  };
  const saved = { ...contact, organizationId: "alder", name: "Sam Taylor", revision: 3 };
  const response = { status: "ok" as const, workspaceName: "Alder", contacts: [contact] };
  const client = createQueryClient();
  vi.mocked(readContacts).mockResolvedValue(response);
  vi.mocked(saveContact).mockImplementation(async () => {
    vi.mocked(readContacts).mockRejectedValue(new Error("Offline"));
    return { status: "ok", contact: saved };
  });
  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
      </WebMessagesProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  await user.clear(screen.getByRole("textbox", { name: "Name" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Sam Taylor");
  await user.click(await screen.findByRole("button", { name: "Save contact" }));

  expect(await screen.findByText(/Saved, but/)).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Resume editing" })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Sam Taylor" })).toHaveFocus(),
  );
  expect(client.getQueryData(contactsOptions("alder").queryKey)).toMatchObject({
    contacts: [saved],
  });

  vi.mocked(readContacts).mockResolvedValue({ ...response, contacts: [saved] });
  await user.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByText(/Saved, but/)).not.toBeInTheDocument());
  expect(saveContact).toHaveBeenCalledOnce();

  await user.click(await screen.findByRole("button", { name: "Actions for Sam Taylor" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sam Taylor");
  client.clear();
});

it.each([true, false])(
  "allows an email-only contact in a required picker (direct: %s)",
  async (direct) => {
    const client = createQueryClient();
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(readContacts).mockResolvedValue({
      status: "ok",
      workspaceName: "Alder Foundation",
      contacts: [
        {
          id: "email-only",
          name: "",
          email: "applicant@example.test",
          affiliation: "",
          archived: false,
          revision: 0,
          applicationTitles: [],
        },
      ],
    });
    render(
      <QueryClientProvider client={client}>
        <WebMessagesProvider>
          <ContactPicker
            direct={direct}
            isRequired
            workspaceSlug="alder"
            value={null}
            label="Applicant contact"
            onChange={onChange}
          />
        </WebMessagesProvider>
      </QueryClientProvider>,
    );
    if (!direct) {
      await user.click(await screen.findByRole("button", { name: /Applicant contact/ }));
    }
    const option = await screen.findByRole("option", { name: "applicant@example.test" });

    expect(option).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("option", { name: "No contact" })).not.toBeInTheDocument();
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("email-only");
  },
);

it("invalidates linked grant records after a contact save without refreshing workspace access or team", async () => {
  const client = createQueryClient();
  const contact = {
    id: "sam-workshop",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "Community group",
    applicationTitles: ["Workshop Saturdays"],
    history: [],
    archived: false,
    revision: 0,
  };
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts: [contact],
  });
  const affected = [
    applicationOptions("alder", "b8q3w5j7c2df").queryKey,
    roundsOptions("alder").queryKey,
  ];
  const unaffected = [
    workspaceOptions("alder").queryKey,
    teamOptions("alder").queryKey,
    applicationOptions("birch", "b8q3w5j7c2df").queryKey,
  ];
  for (const key of [...affected, ...unaffected]) {
    client.setQueryData(key, { status: "not_found" });
  }

  const saved = { ...contact, organizationId: "alder", name: "Sam Taylor", revision: 1 };
  vi.mocked(saveContact).mockImplementation(async () => {
    vi.mocked(readContacts).mockResolvedValue({
      status: "ok",
      workspaceName: "Alder Foundation",
      contacts: [saved],
    });
    return { status: "ok", contact: saved };
  });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
      </WebMessagesProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  const dialog = within(screen.getByRole("dialog", { name: "Edit contact details" }));
  await user.clear(dialog.getByRole("textbox", { name: "Name" }));
  await user.type(dialog.getByRole("textbox", { name: "Name" }), "Sam Taylor");
  await user.click(dialog.getByRole("button", { name: "Save contact" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.getQueryData(contactsOptions("alder").queryKey)).toMatchObject({
    contacts: [saved],
  });

  for (const key of affected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }

  for (const key of unaffected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }

  view.unmount();
  client.clear();
});

it("finds same-name contacts by application, switches status, and returns focus after editing", async () => {
  const contacts: Contact[] = [
    {
      id: "sam-workshop",
      name: "Sam Morgan",
      email: "sam@example.test",
      affiliation: "Community group",
      applicationTitles: ["Workshop Saturdays"],
      archived: false,
      revision: 0,
    },
    {
      id: "sam-rides",
      name: "Sam Morgan",
      email: "",
      affiliation: "",
      applicationTitles: ["Ride Together"],
      archived: true,
      revision: 1,
    },
  ];
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts: contacts.map((contact) => ({
      ...contact,
      applicationTitles: contact.applicationTitles ?? [],
      history: contact.history ?? [],
    })),
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <WebMessagesProvider>
        <ContactsDirectory workspaceSlug="alder" contacts={contacts} />
      </WebMessagesProvider>
    </QueryClientProvider>,
  );

  expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Workshop Saturdays");
  expect(screen.queryByText("Ride Together")).not.toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: "Find a contact" }), "Ride Together");

  expect(screen.getByText("No contacts match your search.")).toBeVisible();

  await user.click(await screen.findByRole("button", { name: /Status/ }));
  await user.click(await screen.findByRole("option", { name: "Archived" }));

  expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Ride Together");

  await user.type(screen.getByRole("textbox", { name: "Find a contact" }), " missing");
  expect(screen.getByText("No contacts match your search.")).toBeVisible();
  await user.click(await screen.findByRole("button", { name: "Clear search" }));

  expect(screen.getByRole("textbox", { name: "Find a contact" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Find a contact" })).toHaveFocus();
  expect(screen.getByRole("table", { name: "Contacts" })).toHaveTextContent("Ride Together");
  expect(screen.queryByText("Workshop Saturdays")).not.toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));

  expect(screen.getByRole("menuitem", { name: "Restore" })).toBeVisible();

  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  const dialog = screen.getByRole("dialog", { name: "Edit contact details" });

  expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Sam Morgan");

  await user.click(within(dialog).getByRole("button", { name: "Discard draft" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actions for Sam Morgan" })).toHaveFocus(),
  );
  expect(saveContact).not.toHaveBeenCalled();
});

it("keeps the parent picker protected while creating a contact and releases it on cancel or save", async () => {
  const client = createQueryClient();
  const user = userEvent.setup();
  const onEditorOpenChange = vi.fn();
  const onChange = vi.fn();
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts: [],
  });
  vi.mocked(saveContact).mockResolvedValue({
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
  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <ContactPicker
          direct
          workspaceSlug="alder"
          value={null}
          label="Applicant contact"
          onChange={onChange}
          onEditorOpenChange={onEditorOpenChange}
        />
      </WebMessagesProvider>
    </QueryClientProvider>,
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
  expect(vi.mocked(saveContact).mock.lastCall?.[0]).toEqual({
    data: {
      workspaceSlug: "alder",
      contactId: expect.any(String) as unknown,
      action: "create",
      details: { name: "Leah Martin", email: "leah@example.test", affiliation: "" },
    },
  });
  expect(onEditorOpenChange).toHaveBeenLastCalledWith(false);
});

it("retains invalid contact drafts across close and reload, then discards explicitly", async () => {
  const { ContactDrafts } = await import("@merit/contacts-web/drafts");
  sessionStorage.clear();
  vi.mocked(readContacts).mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [] });

  const show = () =>
    render(
      <QueryClientProvider client={createQueryClient()}>
        <WebMessagesProvider>
          <ContactDrafts scope="contact-draft-test">
            <ContactsDirectory workspaceSlug="alder" contacts={[]} />
          </ContactDrafts>
        </WebMessagesProvider>
      </QueryClientProvider>,
    );

  const user = userEvent.setup();
  const first = show();
  await user.click(await screen.findByRole("button", { name: "Add contact" }));
  await user.type(screen.getByRole("textbox", { name: "Email" }), "unfinished@");
  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  expect(await screen.findByRole("button", { name: "Resume contact" })).toBeVisible();

  first.unmount();
  show();
  await user.click(await screen.findByRole("button", { name: "Resume contact" }));

  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("unfinished@");

  await user.click(await screen.findByRole("button", { name: "Discard draft" }));
  await user.click(await screen.findByRole("button", { name: "Add contact" }));

  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");

  sessionStorage.clear();
});

it("retains the contact revision on resume and blocks dismissal during a save", async () => {
  const { ContactDrafts } = await import("@merit/contacts-web/drafts");
  const contact = {
    id: "contact-test",
    name: "Sam",
    email: "",
    affiliation: "",
    revision: 4,
    archived: false,
    history: [],
    applicationTitles: [],
  };
  const client = createQueryClient();
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [contact],
  });
  let resolve!: (value: Awaited<ReturnType<typeof saveContact>>) => void;
  vi.mocked(saveContact).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <ContactDrafts>
          <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
        </ContactDrafts>
      </WebMessagesProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Actions for Sam" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), " Taylor");
  await user.keyboard("{Escape}");
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  await user.click(await screen.findByRole("button", { name: "Save contact" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Saving contact…" })).toBeDisabled(),
  );

  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog")).toBeVisible();
  expect(vi.mocked(saveContact).mock.lastCall?.[0].data).toMatchObject({
    action: "update",
    expectedContactRevision: 4,
  });

  resolve({ status: "unavailable" });

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sam Taylor");
});
