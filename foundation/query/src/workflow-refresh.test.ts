// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useWorkflowRefresh } from "./workflow-refresh";

afterEach(cleanup);

it("reports which refresh failed and clears the failure once a retried read succeeds", async () => {
  const read = vi
    .fn<(context: "saved" | "read") => Promise<unknown>>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  const { result } = renderHook(() => useWorkflowRefresh(read));

  await act(() => result.current.refresh("saved"));

  expect(result.current.refreshError).toBe("saved");
  expect(result.current.refreshing).toBe(false);

  await act(() => result.current.refresh("read"));

  expect(result.current.refreshError).toBeNull();
});

it("shows a refresh in progress until its read settles", async () => {
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
