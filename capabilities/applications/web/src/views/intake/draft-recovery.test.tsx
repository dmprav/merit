import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import type { IntakeData } from "../../contracts/intake";
import { DraftContext } from "../../controllers/intake/drafts";
import {
  intakeSnapshot,
  newIntakeDraft,
  type IntakeDraft,
} from "../../controllers/intake/intake-state";
import { useApplicationIntake } from "../../controllers/intake/use-application-intake";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ApplicationIntake } from "./intake-content";

vi.mock("@merit/contacts-web/contacts", () => ({ ContactPicker: () => null }));

const application = applicationView(
  makeApplication({ title: "Saved application", summary: "Saved staff summary" }),
);
const recovered = {
  ...newIntakeDraft("details", intakeSnapshot(application, null), 1),
  value: { summary: "Unfinished staff summary" },
};

const show = (revision = 2, draft: IntakeDraft = recovered) => {
  const data: IntakeData = {
    draftKey: "application",
    workspaceSlug: "alder",
    publicId: application.id,
    state: { revision, history: [], workingRevision: null },
    save: vi.fn().mockResolvedValue({ status: "unavailable" }),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  };
  const setApplicationEdit = vi.fn();
  const client = createQueryClient();

  const page = (ready: boolean) => (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <DraftContext
          value={{
            ready,
            applicationEdits: ready ? { [`application:${draft.section}`]: draft } : {},
            setApplicationEdit,
          }}
        >
          <ApplicationIntake
            application={application}
            session={{ data, onDeleted: vi.fn() }}
            onReveal={vi.fn()}
          >
            {(content) => (
              <>
                <h1>{content.title}</h1>
                {content.overview}
                {content.evidence}
                {content.feedback}
                {content.menu.items.map((item) => (
                  <button key={item.id} onClick={() => content.menu.onAction(item.id)}>
                    {item.label}
                  </button>
                ))}
              </>
            )}
          </ApplicationIntake>
        </DraftContext>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );

  const view = render(page(false));
  return { data, setApplicationEdit, recover: () => view.rerender(page(true)) };
};

it("keeps the application readable while restoring and preserves an early-open editor's recovered conflict baseline", async () => {
  const user = userEvent.setup();
  const { data, setApplicationEdit, recover } = show();
  expect(screen.getByRole("heading", { name: "Saved application" })).toBeVisible();
  expect(screen.getByText("Saved staff summary")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Edit summary" }));
  expect(screen.getByRole("heading", { name: "Edit staff summary" })).toBeVisible();
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  expect(setApplicationEdit).not.toHaveBeenCalled();
  recover();
  expect(await screen.findByRole("textbox", { name: "Staff summary" })).toHaveValue(
    "Unfinished staff summary",
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByText("Latest saved values", { exact: true })).toBeVisible();
  expect(setApplicationEdit).not.toHaveBeenCalled();
  expect(data.save).not.toHaveBeenCalled();
});

it("closes an intake editor during restoration without losing or reopening recovered writing", async () => {
  const user = userEvent.setup();
  const { setApplicationEdit, recover } = show();
  await user.click(screen.getByRole("button", { name: "Edit summary" }));
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  await user.keyboard("{Escape}");
  recover();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByText("Saved staff summary")).toBeVisible();
  expect(setApplicationEdit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue editing summary" }));
  expect(screen.getByRole("textbox", { name: "Staff summary" })).toHaveValue(
    "Unfinished staff summary",
  );
});

it("saves recovered intake writing against its original revision once recovery is ready", async () => {
  const user = userEvent.setup();
  const { data, recover } = show(1);
  await user.click(screen.getByRole("button", { name: "Edit summary" }));
  recover();
  await user.click(await screen.findByRole("button", { name: "Save" }));
  expect(data.save).toHaveBeenCalledWith(
    { action: "details", summary: "Unfinished staff summary" },
    1,
  );
});

it("cancels an early title opening when recovery reveals existing unfinished content", async () => {
  const user = userEvent.setup();
  const titleDraft = {
    ...newIntakeDraft("title", intakeSnapshot(application, null), 1),
    value: { title: "Unfinished application title" },
  };
  const { data, setApplicationEdit, recover } = show(1, titleDraft);
  await user.click(screen.getByRole("button", { name: "Saved application" }));
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  recover();
  const title = await screen.findByRole("button", { name: "Saved application" });
  expect(title).toBeDisabled();
  await user.click(title);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(setApplicationEdit).not.toHaveBeenCalled();
  expect(data.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue correcting application title" }));
  expect(screen.getByRole("textbox", { name: "Project title" })).toHaveValue(
    "Unfinished application title",
  );
  expect(setApplicationEdit).not.toHaveBeenCalled();
});

const restoringController = () => {
  const data: IntakeData = {
    draftKey: "application",
    workspaceSlug: "alder",
    publicId: application.id,
    state: { revision: 1, history: [], workingRevision: null },
    save: vi.fn().mockResolvedValue({ status: "ok", revision: 2 }),
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  };
  const setApplicationEdit = vi.fn();
  const client = createQueryClient();
  const rendered = renderHook(
    () => useApplicationIntake({ application, data, onDeleted: vi.fn() }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <DraftContext value={{ ready: false, applicationEdits: {}, setApplicationEdit }}>
            {children}
          </DraftContext>
        </QueryClientProvider>
      ),
    },
  );
  return { ...rendered, data, setApplicationEdit };
};

it.each(["withdraw", "reinstate"] as const)(
  "allows %s while recovery is pending without changing unseen drafts",
  async (action) => {
    const { result, data, setApplicationEdit } = restoringController();
    act(() => result.current.setConfirmation(action));
    await act(() =>
      result.current.confirm({ reason: "Applicant request", withdrawnOn: "2026-11-14" }),
    );
    expect(data.save).toHaveBeenCalledWith(
      action === "withdraw"
        ? { action, reason: "Applicant request", withdrawnOn: "2026-11-14" }
        : { action, reason: "Applicant request" },
      1,
    );
    expect(setApplicationEdit).not.toHaveBeenCalled();
  },
);

it("blocks finalizing intake while recovery may still contain unfinished writing", async () => {
  const { result, data, setApplicationEdit } = restoringController();
  await act(async () => {
    expect(await result.current.markReady()).toEqual({ status: "busy" });
    expect(await result.current.publishRevision()).toEqual({ status: "busy" });
  });
  expect(data.save).not.toHaveBeenCalled();
  expect(setApplicationEdit).not.toHaveBeenCalled();
});
