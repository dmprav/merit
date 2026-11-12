import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { StartDemo } from "../contracts";
import { useDemoEntry } from "./use-demo-entry";

it.each([false, true])(
  "enters an existing demo once with guided=%s without starting another workspace",
  (guided) => {
    const ready = { status: "ready", workspaceSlug: "existing", expiresAt: "2027-01-25" } as const;
    const start = vi.fn<StartDemo>();
    const enter = vi.fn();
    const { rerender, result } = renderHook(() => useDemoEntry(ready, start, enter, guided));
    rerender();

    expect(result.current.pending).toBe(true);
    expect(enter).toHaveBeenCalledExactlyOnceWith(ready, guided);
    expect(start).not.toHaveBeenCalled();
  },
);

it("retains a retryable entry after a failed start and enters only a ready workspace", async () => {
  const start = vi.fn<StartDemo>().mockRejectedValueOnce(new Error("Offline"));
  const enter = vi.fn();
  const { result } = renderHook(() => useDemoEntry({ status: "expired" }, start, enter));
  await act(() => result.current.start(true));

  expect(result.current.state).toEqual({ status: "unavailable" });
  expect(result.current.pending).toBe(false);
  expect(enter).not.toHaveBeenCalled();

  const ready = { status: "ready", workspaceSlug: "replacement", expiresAt: "2027-01-25" } as const;
  start.mockResolvedValueOnce(ready);
  await act(() => result.current.start(false));

  expect(start).toHaveBeenLastCalledWith({ fresh: false });
  expect(enter).toHaveBeenCalledExactlyOnceWith(ready, false);
});

it.each([false, true])(
  "keeps the visitor’s guided=%s choice through a failed start and retry",
  async (guided) => {
    const start = vi.fn<StartDemo>().mockResolvedValueOnce({ status: "limited" });
    const enter = vi.fn();
    const { result } = renderHook(() => useDemoEntry({ status: "empty" }, start, enter, !guided));
    await act(() => result.current.start(false, guided));

    expect(result.current.state).toEqual({ status: "limited" });
    expect(result.current.pending).toBe(false);
    expect(enter).not.toHaveBeenCalled();

    const ready = { status: "ready", workspaceSlug: "new-demo", expiresAt: "2027-01-25" } as const;
    start.mockResolvedValueOnce(ready);
    await act(() => result.current.start(false));

    expect(start).toHaveBeenLastCalledWith({ fresh: false });
    expect(enter).toHaveBeenCalledExactlyOnceWith(ready, guided);
  },
);
