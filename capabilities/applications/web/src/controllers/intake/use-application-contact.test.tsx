import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import type { ApplicationContactData } from "../../contracts/intake";
import { useApplicationContact } from "./use-application-contact";

const setup = () => {
  const data = {
    workspaceSlug: "alder",
    selectContact: vi.fn<ApplicationContactData["selectContact"]>().mockResolvedValue({
      status: "ok",
      revision: 4,
    }),
    refresh: vi.fn<ApplicationContactData["refresh"]>().mockResolvedValue(undefined),
    refreshCurrent: vi.fn<ApplicationContactData["refreshCurrent"]>().mockResolvedValue(undefined),
  };
  const client = createQueryClient();
  const hook = renderHook(
    ({ contactId, revision }) => useApplicationContact(data, contactId, revision),
    {
      initialProps: { contactId: "original" as string | null, revision: 3 },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );

  return { ...hook, data };
};

it("retains committed Undo when refresh fails and retries only the read", async () => {
  const { result, data } = setup();
  data.refresh.mockRejectedValue(new Error("Offline"));

  act(() => result.current.changeOpen(true));
  await act(() => result.current.selectContact("selected"));

  expect(data.selectContact).toHaveBeenCalledExactlyOnceWith("selected", 3);
  expect(result.current.saved).toBe(1);
  expect(result.current.open).toBe(false);
  expect(result.current.canUndo).toBe(true);
  expect(result.current.failure).toBeNull();
  expect(result.current.refreshError).toBe("saved");

  act(() => result.current.changeOpen(true));
  expect(result.current.refreshError).toBe("saved");

  await act(() => result.current.retryRefresh());

  expect(result.current.refreshError).toBe("saved");
  expect(result.current.pending).toBe(false);

  data.refresh.mockResolvedValue(undefined);
  await act(() => result.current.retryRefresh());

  expect(data.selectContact).toHaveBeenCalledTimes(1);
  expect(result.current.saved).toBe(1);
  expect(result.current.canUndo).toBe(true);
  expect(result.current.refreshError).toBeNull();
});

it("keeps the opened baseline through a conflict and failed read until the picker is reopened", async () => {
  const { result, data, rerender } = setup();
  data.selectContact.mockResolvedValue({ status: "conflict" });
  data.refreshCurrent.mockRejectedValue(new Error("Offline"));
  act(() => result.current.changeOpen(true));
  rerender({ contactId: "original", revision: 5 });

  await act(() => result.current.selectContact("selected"));

  expect(data.selectContact).toHaveBeenLastCalledWith("selected", 3);
  expect(result.current.saved).toBe(0);
  expect(result.current.canUndo).toBe(false);
  expect(result.current.failure).toEqual({ status: "conflict" });
  expect(result.current.refreshError).toBe("read");

  await act(() => result.current.retryRefresh());

  expect(result.current.refreshError).toBe("read");
  expect(result.current.pending).toBe(false);

  data.refreshCurrent.mockResolvedValue(undefined);
  await act(() => result.current.retryRefresh());

  expect(data.selectContact).toHaveBeenCalledTimes(1);
  expect(result.current.failure).toEqual({ status: "conflict" });
  expect(result.current.refreshError).toBeNull();

  await act(() => result.current.selectContact("selected"));
  expect(data.selectContact).toHaveBeenLastCalledWith("selected", 3);

  act(() => result.current.changeOpen(false));
  act(() => result.current.changeOpen(true));
  expect(result.current.failure).toBeNull();

  await act(() => result.current.selectContact("selected"));
  expect(data.selectContact).toHaveBeenLastCalledWith("selected", 5);
});

it("checks Undo against the committed revision even when newer application data arrives", async () => {
  const { result, data, rerender } = setup();
  await act(() => result.current.selectContact("selected"));
  rerender({ contactId: "colleague", revision: 5 });
  data.selectContact.mockResolvedValueOnce({ status: "conflict" });

  await act(() => result.current.undoSelection());

  expect(data.selectContact).toHaveBeenLastCalledWith("original", 4);
  expect(result.current.failure).toEqual({ status: "conflict" });
  expect(result.current.canUndo).toBe(true);
  expect(result.current.saved).toBe(1);
});

it("can undo a committed selection before refreshed props arrive and clears Undo after success", async () => {
  const { result, data } = setup();
  data.refresh.mockRejectedValueOnce(new Error("Offline"));
  await act(() => result.current.selectContact("selected"));
  data.selectContact.mockResolvedValueOnce({ status: "ok", revision: 5 });

  await act(() => result.current.undoSelection());

  expect(data.selectContact).toHaveBeenLastCalledWith("original", 4);
  expect(result.current.saved).toBe(2);
  expect(result.current.canUndo).toBe(false);
  expect(result.current.refreshError).toBeNull();
});

it("keeps actions pending and rejects repeated commands until the saved work finishes refreshing", async () => {
  const { result, data } = setup();

  let finishRefresh = () => {};

  data.refresh.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  act(() => result.current.changeOpen(true));
  let saving: Promise<void>;
  act(() => {
    saving = result.current.selectContact("selected");
    void result.current.selectContact("duplicate");
  });

  await waitFor(() => expect(result.current.saved).toBe(1));
  expect(result.current.pending).toBe(true);

  act(() => result.current.changeOpen(true));
  await act(() => result.current.selectContact("another"));
  await act(() => result.current.undoSelection());
  expect(result.current.open).toBe(false);
  expect(data.selectContact).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishRefresh();
    await saving;
  });
  expect(result.current.pending).toBe(false);
});

it("preserves business failures as data and treats thrown writes as unavailable", async () => {
  const { result, data } = setup();
  data.selectContact.mockResolvedValueOnce({ status: "invalid", error: "contact_unavailable" });

  await act(() => result.current.selectContact("selected"));

  expect(result.current.failure).toEqual({ status: "invalid", error: "contact_unavailable" });
  expect(data.refresh).not.toHaveBeenCalled();
  expect(result.current.canUndo).toBe(false);

  data.selectContact.mockRejectedValueOnce(new Error("Offline"));
  await act(() => result.current.selectContact("selected"));

  expect(result.current.failure).toEqual({ status: "unavailable" });
  expect(result.current.pending).toBe(false);
  expect(result.current.saved).toBe(0);
});
