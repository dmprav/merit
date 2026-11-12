import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { StartDemo } from "../contracts";
import { useDemoReset } from "./use-demo-reset";

it("keeps reset recoverable on failure and hands off only a ready replacement workspace", async () => {
  const start = vi.fn<StartDemo>().mockResolvedValueOnce({ status: "unavailable" });
  const onReady = vi.fn();
  const { result } = renderHook(() => useDemoReset("original-workspace", start, onReady));

  act(() => result.current.open());
  await act(() => result.current.confirm());

  expect(result.current).toMatchObject({ isOpen: true, pending: false, failed: true });
  expect(onReady).not.toHaveBeenCalled();

  const ready = { status: "ready", workspaceSlug: "replacement", expiresAt: "2027-01-25" } as const;
  start.mockResolvedValueOnce(ready);
  await act(() => result.current.confirm());

  expect(start).toHaveBeenLastCalledWith({ fresh: true, resetWorkspaceId: "original-workspace" });
  expect(onReady).toHaveBeenCalledExactlyOnceWith(ready);
});

it("keeps a rejected reset editable and clears its error when reopened", async () => {
  const start = vi.fn<StartDemo>().mockRejectedValue(new Error("Offline"));
  const onReady = vi.fn();
  const { result } = renderHook(() => useDemoReset("original-workspace", start, onReady));

  await act(() => result.current.confirm());

  expect(result.current).toMatchObject({ pending: false, failed: true });
  expect(onReady).not.toHaveBeenCalled();

  act(() => result.current.open());

  expect(result.current).toMatchObject({ isOpen: true, failed: false });
});
