import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { ApplicationContactData } from "@merit/applications-web/contracts";
import { ApplicationIntake } from "@merit/applications-web/work";
import { ContactDrafts } from "@merit/contacts-web/drafts";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import { WebMessagesProvider } from "../../../../app/messages";
import { WorkspaceContacts } from "../../../contacts/contacts-provider";
import { readContacts } from "../../../contacts/data/server/contacts.functions";

vi.mock("../../../contacts/data/server/contacts.functions", () => ({
  readContacts: vi.fn(),
  saveContact: vi.fn(),
}));

const setup = (
  name?: string,
  status: "ready" | "in_preparation" | "withdrawn" = "ready",
  readOnly = false,
) => {
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [
      {
        id: "sam",
        name: "Sam Morgan",
        email: "sam@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
      },
    ],
  });
  const data = {
    workspaceSlug: "alder",
    publicId: "b8q3w5j7c2df",
    draftKey: "test-application-contact",
    state: { revision: 3, workingRevision: null, history: [] },
    save: vi.fn().mockResolvedValue({ status: "ok", revision: 4 }),
    selectContact: vi.fn<ApplicationContactData["selectContact"]>().mockResolvedValue({
      status: "ok",
      revision: 4,
    }),
    refresh: vi.fn<ApplicationContactData["refresh"]>().mockResolvedValue(undefined),
    refreshCurrent: vi.fn<ApplicationContactData["refreshCurrent"]>().mockResolvedValue(undefined),
  };
  const client = createQueryClient();
  const application = applicationView(
    makeApplication({
      contactId: null,
      intakeStatus: status === "in_preparation" ? "in_preparation" : "ready",
      ...(status === "withdrawn"
        ? {
            withdrawal: {
              withdrawnOn: "2027-01-20",
              reason: "Applicant withdrew.",
              recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-20T12:00:00Z" },
            },
          }
        : {}),
      submission: {
        version: 1,
        organization: "Repair Collective",
        contact: name ?? "",
        answers: [],
      },
    }),
  );
  render(
    <ApplicationIntake
      application={application}
      session={readOnly ? undefined : { data, onDeleted: async () => {} }}
      onReveal={() => {}}
    >
      {({ overview }) => overview}
    </ApplicationIntake>,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <WebMessagesProvider>
            <GrantmakingDrafts>
              <ContactDrafts>
                <WorkspaceContacts>{children}</WorkspaceContacts>
              </ContactDrafts>
            </GrantmakingDrafts>
          </WebMessagesProvider>
        </QueryClientProvider>
      ),
    },
  );

  return { data, user: userEvent.setup() };
};

it("uses one section pencil, read-only recorded facts, and a contact choice only in edit mode", async () => {
  const { user } = setup("Leah Martin");
  const name = screen.getByText("Leah Martin");
  expect(name.closest("button")).toBeNull();
  await user.click(name);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  expect(screen.queryByRole("button", { name: /Change contact/ })).not.toBeInTheDocument();
  const section = screen.getByRole("region", { name: "Application details" });
  expect(within(section).getAllByRole("button")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(section).getByText("Repair Collective")).toBeVisible();
  const choice = screen.getByRole("button", { name: "Change contact: Leah Martin" });
  expect(choice).toHaveFocus();
  await user.click(choice);
  const picker = within(await screen.findByRole("dialog", { name: "Change contact" }));
  expect(picker.getByRole("textbox", { name: "Find a contact" })).toBeVisible();
  expect(await picker.findByRole("option", { name: /Sam Morgan/ })).toBeVisible();
});

it.each([false, true])(
  "retries a committed refresh failure without assigning again (picker reopened: %s)",
  async (reopen) => {
    const { data, user } = setup();
    await user.click(screen.getByRole("button", { name: "Edit application details" }));
    data.refresh.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Change contact" }));
    await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    let warning = screen.getByRole("alert");
    expect(warning).toHaveAttribute("data-tone", "warning");
    expect(warning).toHaveTextContent("Saved, but the latest information could not be loaded.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    if (reopen) {
      await user.click(screen.getByRole("button", { name: "Change contact" }));
      warning = within(screen.getByRole("dialog", { name: "Change contact" })).getByRole("alert");
      expect(warning).toHaveTextContent("Saved, but the latest information could not be loaded.");
    }

    await user.click(within(warning).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(data.refresh).toHaveBeenCalledTimes(2);
    expect(data.refreshCurrent).not.toHaveBeenCalled();
    expect(data.selectContact).toHaveBeenCalledExactlyOnceWith("sam", 3);

    if (reopen) {
      await user.click(
        within(screen.getByRole("dialog", { name: "Change contact" })).getByRole("button", {
          name: "Close",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument(),
    );
    expect(data.selectContact).toHaveBeenLastCalledWith(null, 4);
  },
);

it.each([
  {
    result: { status: "invalid", error: "contact_unavailable" },
    message: "This contact is no longer available. Select an active contact and save again.",
  },
  {
    result: { status: "invalid", error: "invalid_application" },
    message: "Could not change the contact. Try again.",
  },
  { result: { status: "not_found" }, message: "This workspace is no longer available to you." },
  { result: { status: "signed_out" }, message: "This workspace is no longer available to you." },
  { result: { status: "unavailable" }, message: "Could not change the contact. Try again." },
] as const)(
  "explains a $result.status write failure inside and outside the picker",
  async ({ result, message }) => {
    const { data, user } = setup();
    await user.click(screen.getByRole("button", { name: "Edit application details" }));
    data.selectContact.mockResolvedValueOnce(result);
    await user.click(screen.getByRole("button", { name: "Change contact" }));
    await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));

    const picker = within(screen.getByRole("dialog", { name: "Change contact" }));
    const failure = await picker.findByRole("alert");
    expect(failure).toHaveAttribute("data-tone", "danger");
    expect(failure).toHaveTextContent(message);
    expect(picker.getByRole("button", { name: "Close" })).toBeEnabled();
    expect(data.refresh).not.toHaveBeenCalled();
    expect(data.refreshCurrent).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change contact" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Change contact" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(data.selectContact).toHaveBeenCalledExactlyOnceWith("sam", 3);
  },
);

it("keeps a conflicting assignment distinct from a failed read and disables actions during retry", async () => {
  const { data, user } = setup();
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  data.selectContact.mockResolvedValueOnce({ status: "conflict" });
  data.refreshCurrent.mockRejectedValueOnce(new Error("Offline"));
  await user.click(screen.getByRole("button", { name: "Change contact" }));
  await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));
  const picker = within(screen.getByRole("dialog", { name: "Change contact" }));
  const conflictMessage =
    "This application changed. Close and reopen the contact picker to review the latest information.";
  expect(await picker.findByText(conflictMessage)).toBeVisible();
  expect(
    await picker.findByText(
      "The latest information could not be loaded. Try again to review current work.",
    ),
  ).toBeVisible();
  expect(
    picker.queryByText("Saved, but the latest information could not be loaded."),
  ).not.toBeInTheDocument();

  let finishRefresh = () => {};

  data.refreshCurrent.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const retry = picker.getByRole("button", { name: "Retry" });
  await user.click(retry);
  expect(retry).toBeDisabled();
  expect(picker.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(picker.getByText(conflictMessage)).toBeVisible();

  await act(async () => finishRefresh());

  await waitFor(() =>
    expect(picker.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument(),
  );
  expect(picker.getByRole("alert")).toHaveTextContent(conflictMessage);
  expect(picker.getByRole("button", { name: "Close" })).toBeEnabled();
  expect(data.refreshCurrent).toHaveBeenCalledTimes(2);
  expect(data.refresh).not.toHaveBeenCalled();
  expect(data.selectContact).toHaveBeenCalledExactlyOnceWith("sam", 3);
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
});

it("returns keyboard focus to the contact control after a slow post-save refresh", async () => {
  const { data, user } = setup();
  await user.click(screen.getByRole("button", { name: "Edit application details" }));

  let finishRefresh = () => {};

  data.refresh.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const trigger = screen.getByRole("button", { name: "Change contact" });
  const close = screen.getByRole("button", { name: "Close" });
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));

  await waitFor(() => expect(data.refresh).toHaveBeenCalledTimes(1));
  expect(trigger).toBeDisabled();
  expect(close).toBeDisabled();
  // Let the closed popover finish restoring focus while refresh still disables the trigger.
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  await act(async () => finishRefresh());

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toBeEnabled();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps Undo and refresh recovery after closing the section and returns focus to its pencil", async () => {
  const { data, user } = setup();
  data.refresh.mockRejectedValueOnce(new Error("Offline"));
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  await user.click(screen.getByRole("button", { name: "Change contact" }));
  await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit application details" })).toHaveFocus(),
  );
  expect(screen.queryByRole("button", { name: /Change contact/ })).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Saved, but the latest information could not be loaded.",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(data.selectContact).toHaveBeenCalledExactlyOnceWith("sam", 3);
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(data.selectContact).toHaveBeenLastCalledWith(null, 4);
});

it("keeps a nested contact draft and prevents the section from closing underneath it", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  const editor = screen.getByRole("group", { name: "Edit application details" });
  const close = within(editor).getByRole("button", { name: "Close" });
  await user.click(screen.getByRole("button", { name: "Change contact" }));
  await user.click(await screen.findByRole("button", { name: "Add contact" }));
  const nested = within(screen.getByRole("dialog", { name: "Add contact" }));
  await user.type(nested.getByRole("textbox", { name: "Name" }), "Unfinished contact");
  expect(close).toBeDisabled();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Add contact" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("dialog", { name: "Change contact" })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Resume contact" })).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(close);
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  await user.click(screen.getByRole("button", { name: "Change contact" }));
  await user.click(await screen.findByRole("button", { name: "Resume contact" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Unfinished contact");
});

it("prepares a contact change through the section form and commits only on Save", async () => {
  const { data, user } = setup(undefined, "in_preparation");
  expect(screen.queryByRole("button", { name: /Change contact/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit application details" }));
  const form = within(await screen.findByRole("form", { name: "Edit application details" }));
  await user.click(await form.findByRole("button", { name: /Applicant contact/ }));
  await user.click(await screen.findByRole("option", { name: /Sam Morgan/ }));
  expect(data.save).not.toHaveBeenCalled();
  expect(data.selectContact).not.toHaveBeenCalled();
  await user.click(form.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(data.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: "save_content", contactId: "sam" }),
      3,
    ),
  );
  expect(data.selectContact).not.toHaveBeenCalled();
});

it.each(["withdrawn", "read-only"])("has no details or contact edit control when %s", (mode) => {
  setup("Sam Morgan", mode === "withdrawn" ? "withdrawn" : "ready", mode === "read-only");
  expect(screen.getByText("Sam Morgan")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Change contact|Edit application details/ }),
  ).not.toBeInTheDocument();
});
