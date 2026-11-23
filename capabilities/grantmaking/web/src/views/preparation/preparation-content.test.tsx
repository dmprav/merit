import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { roundView } from "@merit/grantmaking/api";
import { makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import type { PreparationData } from "@merit/rounds-web/contracts";
import { Toasts } from "@merit/ui/toast";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundPreview as FundingRoundView } from "../../testing/application-list-preview";
import { GrantmakingDrafts } from "../drafts";

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    return this.state.error ? <p>Route error</p> : this.props.children;
  }
}

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
          <GrantmakingDrafts>
            <RouteErrorBoundary>{children}</RouteErrorBoundary>
            <Toasts />
          </GrantmakingDrafts>
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

it("confirms a committed deletion and leaves for the rounds without an in-between screen", async () => {
  const { data, onDeleted, user } = setup();
  await confirmDeletion(user);

  expect(await screen.findByRole("alertdialog", { name: "Round deleted" })).toBeVisible();
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(data.delete).toHaveBeenCalledOnce();
  expect(vi.mocked(data.delete).mock.calls[0]?.[0]).toBe(1);
  expect(data.refreshCurrent).not.toHaveBeenCalled();
});

it("hands a failed departure to the route's error handling without repeating deletion", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const { data, onDeleted, user } = setup();
  onDeleted.mockRejectedValueOnce(new Error("Navigation failed"));
  await confirmDeletion(user);

  expect(await screen.findByText("Route error")).toBeVisible();
  expect(onDeleted).toHaveBeenCalledOnce();
  expect(data.delete).toHaveBeenCalledOnce();
  consoleError.mockRestore();
});

it("keeps a failed deletion available for retry without claiming the round was deleted", async () => {
  const { data, onDeleted, user } = setup();
  vi.mocked(data.delete).mockRejectedValueOnce(new Error("Offline"));
  await confirmDeletion(user);

  expect(screen.getByRole("dialog")).toHaveTextContent("We couldn’t confirm deletion");
  expect(screen.queryByText("Round deleted")).not.toBeInTheDocument();
  expect(onDeleted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete round" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(data.delete).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("alertdialog", { name: "Round deleted" })).toBeVisible();
});
