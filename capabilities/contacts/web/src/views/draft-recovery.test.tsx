import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { useDrafts } from "@merit/drafts";

import type { ContactsData } from "../contracts";
import { ContactDrafts } from "../drafts";
import { ContactsMessagesProvider } from "../messages";
import { ContactPicker } from "./contact-picker";
import { ContactsDirectory } from "./contacts-directory";

vi.mock("@merit/drafts", () => ({ useDrafts: vi.fn() }));

const restoredDraft = {
  id: "original-retry-id",
  baseline: null,
  value: { name: "Unfinished contact", email: "unfinished@example.test", affiliation: "" },
};
const update = vi.fn();

const snapshot = (ready: boolean, unavailable = false) => ({
  drafts: ready && !unavailable ? { "alder/new": restoredDraft } : {},
  ready,
  status: unavailable
    ? ("unavailable" as const)
    : ready
      ? ("saved" as const)
      : ("restoring" as const),
  storageUnavailable: unavailable,
  update,
});

beforeEach(() => {
  vi.mocked(useDrafts).mockReturnValue(snapshot(false));
  update.mockClear();
});

const show = (entry: "directory" | "picker") => {
  const data: ContactsData = {
    contacts: [
      { id: "sam", name: "Saved person", email: "", affiliation: "", archived: false, revision: 3 },
    ],
    readFailed: false,
    save: vi.fn().mockResolvedValue({ status: "unavailable" }),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  };

  const page = () => (
    <ContactsMessagesProvider>
      <ContactDrafts scope="account">
        {entry === "directory" ? (
          <ContactsDirectory
            workspaceSlug="alder"
            data={data}
            contacts={data.contacts}
            renderApplicationLink={(record) => record.title}
          />
        ) : (
          <ContactPicker
            workspaceSlug="alder"
            data={data}
            direct
            label="Contact"
            value={null}
            onChange={vi.fn()}
          />
        )}
      </ContactDrafts>
    </ContactsMessagesProvider>
  );

  const view = render(page());
  return {
    data,
    recover: (unavailable = false) => {
      vi.mocked(useDrafts).mockReturnValue(snapshot(true, unavailable));
      view.rerender(page());
    },
  };
};

it.each(["directory", "picker"] as const)(
  "keeps the %s readable and restores an opened editor before initializing its values",
  async (entry) => {
    const user = userEvent.setup();
    const { data, recover } = show(entry);
    expect(screen.getByText("Saved person")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = screen.getByRole("dialog", { name: "Add contact" });
    expect(within(dialog).getByText("Preparing editor…")).toBeVisible();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    recover();
    expect(await within(dialog).findByRole("textbox", { name: "Name" })).toHaveValue(
      "Unfinished contact",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save contact" }));
    expect(data.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "original-retry-id",
        action: "create",
        details: restoredDraft.value,
      }),
    );
  },
);

it.each(["directory", "picker"] as const)(
  "cancels the %s editor during restoration without discarding or reopening it",
  async (entry) => {
    const user = userEvent.setup();
    const { recover } = show(entry);
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    recover();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Resume contact" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Unfinished contact");
  },
);

it("releases the editor after failed recovery and keeps the storage warning", async () => {
  const user = userEvent.setup();
  const { recover } = show("directory");
  await user.click(screen.getByRole("button", { name: "Add contact" }));
  recover(true);
  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("");
  expect(screen.getByText(/Draft recovery is unavailable/)).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Memory writing");
  expect(update).toHaveBeenCalled();
});
