import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

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

const round = {
  ...getExampleRound(),
  title: "Saved round",
  purpose: "Saved purpose",
  applications: [],
};
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
          value={{ ready, edits: ready ? { "round/purpose": recovered } : {}, setEdit }}
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
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
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

it("guards quick writes and deletion until the round store is ready", async () => {
  const data = dataFixture();
  const setEdit = vi.fn();
  const client = createQueryClient();
  let ready = false;
  const edits: Record<string, PreparationDraft | undefined> = {};
  const { result, rerender } = renderHook(
    () => useRoundPreparation({ round, data, onDeleted: vi.fn(), onRestoreFocus: vi.fn() }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <DraftContext value={{ ready, edits, setEdit }}>{children}</DraftContext>
        </QueryClientProvider>
      ),
    },
  );
  await act(async () => {
    expect(await result.current.renameRound("Changed title")).toEqual({ status: "busy" });
    expect(await result.current.changeMeetingDate("2027-03-02")).toEqual({ status: "busy" });
    expect(await result.current.assignManager("manager")).toEqual({ status: "busy" });
  });
  act(() => result.current.setDeleting(true));
  await act(() => result.current.confirmDelete());
  expect(data.save).not.toHaveBeenCalled();
  expect(data.delete).not.toHaveBeenCalled();
  expect(setEdit).not.toHaveBeenCalled();
  ready = true;
  rerender();
  await act(() => result.current.confirmDelete());
  expect(data.delete).toHaveBeenCalledOnce();
  expect(vi.mocked(data.delete).mock.calls[0]?.[0]).toBe(2);
  expect(setEdit).toHaveBeenCalledWith("round/purpose", undefined);
});
