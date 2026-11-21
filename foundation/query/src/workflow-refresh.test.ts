// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useWorkflowRefresh } from "./workflow-refresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Read = (context: "saved" | "read") => Promise<unknown>;

const advance = (milliseconds: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });

it("retries a failed read quietly and recovers without reporting it", async () => {
  const read = vi
    .fn<Read>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  const { result } = renderHook(() => useWorkflowRefresh(read));

  await act(() => result.current.refresh("saved"));

  expect(result.current.refreshError).toBeNull();
  expect(result.current.refreshing).toBe(false);

  await advance(1000);

  expect(read).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenLastCalledWith("saved");
  expect(result.current.refreshError).toBeNull();
});

it("reports which refresh failed after the quiet retries, then reports an explicit retry at once", async () => {
  const read = vi.fn<Read>().mockRejectedValue(new Error("Offline"));
  const { result } = renderHook(() => useWorkflowRefresh(read));

  await act(() => result.current.refresh("saved"));
  await advance(1000);

  expect(result.current.refreshError).toBeNull();

  await advance(3000);

  expect(read).toHaveBeenCalledTimes(3);
  expect(result.current.refreshError).toBe("saved");

  await act(() => result.current.refresh("saved"));

  expect(read).toHaveBeenCalledTimes(4);
  expect(result.current.refreshError).toBe("saved");

  read.mockResolvedValueOnce(undefined);
  await act(() => result.current.refresh("read"));

  expect(result.current.refreshError).toBeNull();
});

it("shows only the first attempt as refreshing", async () => {
  let finish!: () => void;
  const { result } = renderHook(() =>
    useWorkflowRefresh(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  );

  let refreshing!: Promise<void>;
  act(() => {
    refreshing = result.current.refresh("read");
  });

  expect(result.current.refreshing).toBe(true);

  await act(async () => {
    finish();
    await refreshing;
  });

  expect(result.current.refreshing).toBe(false);
});

it("stops retrying once a newer refresh starts or the workflow unmounts", async () => {
  const read = vi.fn<Read>().mockRejectedValue(new Error("Offline"));
  const { result, unmount } = renderHook(() => useWorkflowRefresh(read));

  await act(() => result.current.refresh("saved"));
  read.mockResolvedValueOnce(undefined);
  await act(() => result.current.refresh("read"));
  await advance(10_000);

  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current.refreshError).toBeNull();

  read.mockRejectedValue(new Error("Offline"));
  await act(() => result.current.refresh("saved"));
  unmount();
  await advance(10_000);

  expect(read).toHaveBeenCalledTimes(3);
});

it("ignores a quiet retry that fails after a newer refresh succeeds", async () => {
  const read = vi
    .fn<Read>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("Late failure")), 100)),
    )
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(new Error("Offline"));
  const { result } = renderHook(() => useWorkflowRefresh(read));

  await act(() => result.current.refresh("saved"));
  await advance(1000);
  await act(() => result.current.refresh("read"));
  await advance(10_000);

  expect(read).toHaveBeenCalledTimes(3);
  expect(result.current.refreshError).toBeNull();
});

it("does not retry a read that fails after the workflow unmounts", async () => {
  const read = vi.fn<Read>(
    () => new Promise((_, reject) => setTimeout(() => reject(new Error("Offline")), 100)),
  );
  const { result, unmount } = renderHook(() => useWorkflowRefresh(read));

  act(() => {
    void result.current.refresh("saved");
  });
  unmount();
  await advance(10_000);

  expect(read).toHaveBeenCalledOnce();
});

it("retries quietly with the newest read operation", async () => {
  const first = vi.fn<Read>().mockRejectedValue(new Error("Offline"));
  const next = vi.fn<Read>().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(({ read }) => useWorkflowRefresh(read), {
    initialProps: { read: first },
  });

  await act(() => result.current.refresh("saved"));
  rerender({ read: next });
  await advance(1000);

  expect(first).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledExactlyOnceWith("saved");
  expect(result.current.refreshError).toBeNull();
});
