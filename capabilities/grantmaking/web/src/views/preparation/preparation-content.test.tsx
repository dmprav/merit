import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { roundView } from "@merit/grantmaking/api";
import { makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import type { PreparationData } from "@merit/rounds-web/contracts";

import { GrantmakingMessagesProvider } from "../../messages";
import { GrantmakingDrafts } from "../drafts";
import { FundingRoundView } from "../rounds/funding-round-view";

const setup = () => {
  const data: PreparationData = {
    draftKey: "round",
    state: { revision: 1, managers: [], budgetHistory: [] },
    save: vi.fn(),
    delete: vi.fn<PreparationData["delete"]>().mockResolvedValue({ status: "ok" }),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshCurrent: vi.fn().mockResolvedValue(undefined),
  };
  const onDeleted = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  render(<FundingRoundView round={roundView(makeRound())} preparation={{ data, onDeleted }} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={createQueryClient()}>
        <GrantmakingMessagesProvider>
          <GrantmakingDrafts>{children}</GrantmakingDrafts>
        </GrantmakingMessagesProvider>
      </QueryClientProvider>
    ),
  });
  return { data, onDeleted, user: userEvent.setup() };
};

const confirmDeletion = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete round" }));
  await user.click(screen.getByRole("button", { name: "Delete round" }));
};

it("preserves committed deletion and retries only navigation when returning to rounds fails", async () => {
  const { data, onDeleted, user } = setup();
  onDeleted.mockRejectedValueOnce(new Error("Navigation failed"));
  await confirmDeletion(user);

  expect(await screen.findByRole("status")).toHaveTextContent("Round deleted.");
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t open the rounds list");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit purpose" })).not.toBeInTheDocument();
  expect(data.delete).toHaveBeenCalledOnce();
  expect(vi.mocked(data.delete).mock.calls[0]?.[0]).toBe(1);

  const back = screen.getByRole("button", { name: "Return to funding rounds" });
  await waitFor(() => expect(back).toHaveFocus());
  await user.click(back);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(data.delete).toHaveBeenCalledOnce();
  expect(data.refreshCurrent).not.toHaveBeenCalled();
});

it("keeps a failed deletion available for retry without claiming the round was deleted", async () => {
  const { data, onDeleted, user } = setup();
  vi.mocked(data.delete).mockRejectedValueOnce(new Error("Offline"));
  await confirmDeletion(user);

  expect(screen.getByRole("dialog")).toHaveTextContent("We couldn’t confirm deletion");
  expect(screen.queryByText("Round deleted.")).not.toBeInTheDocument();
  expect(onDeleted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete round" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(data.delete).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("Round deleted.");
});
