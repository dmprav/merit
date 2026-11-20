import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { roundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { createQueryClient } from "@merit/query";

import type { PreparationData } from "../../contracts/preparation";
import { DraftContext } from "../../controllers/preparation/drafts";
import {
  preparationDraft,
  type PreparationDraft,
} from "../../controllers/preparation/preparation-state";
import { useRoundPreparation } from "../../controllers/preparation/use-round-preparation";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { RoundPreparation } from "./preparation-content";

const round = roundView({
  ...getExampleRound(),
  title: "Saved round",
  purpose: "Saved purpose",
  applications: [],
});
const recovered = {
  ...preparationDraft("purpose", round, 1),
  value: { purpose: "Unfinished purpose" },
};

const dataFixture = (): PreparationData => ({
  draftKey: "round",
  state: { revision: 2, budgetHistory: [], managers: [] },
  save: vi.fn().mockResolvedValue({ status: "ok", revision: 3 }),
  delete: vi.fn().mockResolvedValue({ status: "ok" }),
  refresh: vi.fn().mockResolvedValue(undefined),
  refreshCurrent: vi.fn().mockResolvedValue(undefined),
});

const show = () => {
  const data = dataFixture();
  const client = createQueryClient();
  const setEdit = vi.fn();

  const page = (ready: boolean) => (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <DraftContext
          value={{
            ready,
            edits: ready ? { "round/purpose": recovered } : {},
            conflicts: new Set(),
            resolveConflict: vi.fn(),
            setEdit,
          }}
        >
          <RoundPreparation round={round} session={{ data, onDeleted: vi.fn() }}>
            {(content) => (
              <>
                <h1>{content.title}</h1>
                {content.actions}
                {content.feedback}
                {content.overview}
                {content.properties}
              </>
            )}
          </RoundPreparation>
        </DraftContext>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );

  const view = render(page(false));
  return { data, setEdit, recover: () => view.rerender(page(true)) };
};

it("keeps saved round content readable and restores an early-open purpose editor with its original revision", async () => {
  const user = userEvent.setup();
  const { data, setEdit, recover } = show();
  expect(screen.getByRole("heading", { name: "Saved round" })).toBeVisible();
  expect(screen.getByText("Saved purpose")).toBeVisible();
  expect(screen.getByRole("button", { name: "More actions" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Edit purpose" }));
  expect(screen.getByRole("heading", { name: "Edit purpose" })).toBeVisible();
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  expect(setEdit).not.toHaveBeenCalled();
  recover();
  expect(await screen.findByRole("textbox", { name: "Purpose" })).toHaveValue("Unfinished purpose");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  expect(setEdit).not.toHaveBeenCalled();
  expect(data.save).not.toHaveBeenCalled();
});

it("keeps the budget dialog title and close control while recovery is pending", async () => {
  const user = userEvent.setup();
  const { setEdit, recover } = show();
  await user.click(screen.getByRole("button", { name: /^Edit budget:/ }));
  const dialog = screen.getByRole("dialog", { name: "Edit budget" });
  expect(within(dialog).getByText("Preparing editor…")).toBeVisible();
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Close dialog" }));
  recover();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(setEdit).not.toHaveBeenCalled();
});

it("cancels an inline opening without initializing or discarding the recovered draft", async () => {
  const user = userEvent.setup();
  const { setEdit, recover } = show();
  await user.click(screen.getByRole("button", { name: "Edit purpose" }));
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  await user.keyboard("{Escape}");
  recover();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByText("Saved purpose")).toBeVisible();
  expect(setEdit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue editing purpose" }));
  expect(screen.getByRole("textbox", { name: "Purpose" })).toHaveValue("Unfinished purpose");
});

const renderController = () => {
  const data = dataFixture();
  const setEdit = vi.fn();
  const client = createQueryClient();
  const store = {
    ready: false,
    edits: {} as Record<string, PreparationDraft | undefined>,
    conflicts: new Set<string>(),
    resolveConflict: vi.fn(),
    setEdit,
  };
  const hook = renderHook(
    () => useRoundPreparation({ round, data, onDeleted: vi.fn(), onRestoreFocus: vi.fn() }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <DraftContext value={{ ...store }}>{children}</DraftContext>
        </QueryClientProvider>
      ),
    },
  );

  const ready = () => {
    store.ready = true;
    hook.rerender();
  };

  return { ...hook, data, setEdit, ready };
};

it("reports quick writes as busy until the round store is ready", async () => {
  const { result, data, setEdit } = renderController();

  await act(async () => {
    expect(await result.current.renameRound("Changed title")).toEqual({ status: "busy" });
    expect(await result.current.changeMeetingDate("2027-03-02")).toEqual({ status: "busy" });
    expect(await result.current.assignManager("manager")).toEqual({ status: "busy" });
  });
  expect(data.save).not.toHaveBeenCalled();
  expect(setEdit).not.toHaveBeenCalled();
});

it("defers deletion until the round store is ready, then deletes at the current revision", async () => {
  const { result, data, setEdit, ready } = renderController();
  act(() => result.current.setDeleting(true));
  await act(() => result.current.confirmDelete());

  expect(data.delete).not.toHaveBeenCalled();
  expect(setEdit).not.toHaveBeenCalled();

  ready();
  await act(() => result.current.confirmDelete());

  expect(data.delete).toHaveBeenCalledOnce();
  expect(vi.mocked(data.delete).mock.calls[0]?.[0]).toBe(2);
  expect(setEdit).toHaveBeenCalledWith("round/purpose", undefined);
});

const statefulDraftWrapper =
  (
    client: ReturnType<typeof createQueryClient>,
    initialEdits: Record<string, PreparationDraft | undefined>,
  ) =>
  ({ children }: { children: ReactNode }) => {
    const [edits, setEdits] = useState(initialEdits);

    const setEdit = (draftKey: string, next: PreparationDraft | undefined) => {
      setEdits((current) => ({ ...current, [draftKey]: next }));
    };

    return (
      <QueryClientProvider client={client}>
        <DraftContext
          value={{
            ready: true,
            edits,
            conflicts: new Set(),
            resolveConflict: vi.fn(),
            setEdit,
          }}
        >
          {children}
        </DraftContext>
      </QueryClientProvider>
    );
  };

it("blocks saving or rebasing an untouched stale purpose draft over a newer saved value", async () => {
  const staleDraft = preparationDraft("purpose", round, 1);
  const updatedRound = { ...round, purpose: "Updated elsewhere" };
  const data = dataFixture();

  const { result } = renderHook(
    () =>
      useRoundPreparation({
        round: updatedRound,
        data,
        onDeleted: vi.fn(),
        onRestoreFocus: vi.fn(),
      }),
    {
      wrapper: statefulDraftWrapper(createQueryClient(), { "round/purpose": staleDraft }),
    },
  );

  await act(async () => {
    expect(await result.current.saveDraft(staleDraft)).toBeNull();
  });

  expect(data.save).not.toHaveBeenCalled();
  expect(result.current.draftFor("purpose")).toEqual(staleDraft);
});

it("retains a draft when discard fires during a pending save and clears it after success", async () => {
  const editedDraft = recovered;
  let resolveSave: ((value: { status: "ok"; revision: number }) => void) | undefined;
  const data: PreparationData = {
    ...dataFixture(),
    save: vi.fn(
      () =>
        new Promise<{ status: "ok"; revision: number }>((resolve) => {
          resolveSave = resolve;
        }),
    ),
  };

  const { result } = renderHook(
    () => useRoundPreparation({ round, data, onDeleted: vi.fn(), onRestoreFocus: vi.fn() }),
    {
      wrapper: statefulDraftWrapper(createQueryClient(), { "round/purpose": editedDraft }),
    },
  );

  let savePromise: Promise<unknown> | undefined;
  act(() => {
    savePromise = result.current.saveDraft(editedDraft);
  });
  await waitFor(() => expect(data.save).toHaveBeenCalledOnce());
  expect(result.current.pending).toBe(true);

  act(() => result.current.discard("purpose"));
  expect(result.current.draftFor("purpose")?.value).toEqual(editedDraft.value);

  await act(async () => {
    resolveSave?.({ status: "ok", revision: 3 });
    await savePromise;
  });
  expect(result.current.draftFor("purpose")).toBeUndefined();
});

it("sends requireCurrentRevision on Undo while keeping ordinary quick saves last-write-wins", async () => {
  const data = dataFixture();
  const { result } = renderHook(
    () => useRoundPreparation({ round, data, onDeleted: vi.fn(), onRestoreFocus: vi.fn() }),
    { wrapper: statefulDraftWrapper(createQueryClient(), {}) },
  );

  await act(async () => {
    expect(await result.current.renameRound("Updated title")).toBeNull();
  });
  expect(data.save).toHaveBeenLastCalledWith(
    { section: "details", title: "Updated title" },
    2,
    undefined,
  );
  expect(result.current.undo?.revision).toBe(3);

  await act(async () => {
    expect(await result.current.undoSave()).toBeNull();
  });
  expect(data.save).toHaveBeenLastCalledWith({ section: "details", title: "Saved round" }, 3, {
    requireCurrentRevision: true,
  });
});
