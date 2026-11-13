// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { PageSource } from "./contracts";
import { createQueryClient } from "./index";
import { usePagedContent } from "./pages";

afterEach(cleanup);

const setup = (read: PageSource<string>["read"]) => {
  const client = createQueryClient();
  const source = { queryKey: ["private", "history"], read };

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  return { client, ...renderHook(() => usePagedContent(source), { wrapper }) };
};

it("keeps the current page after a failed older-page read and retries the same cursor", async () => {
  const read = vi
    .fn<PageSource<string>["read"]>()
    .mockResolvedValueOnce({ entries: ["recent"], nextCursor: "older" })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ entries: ["old"], nextCursor: null });
  const { result } = setup(read);
  await waitFor(() => expect(result.current.entries).toEqual(["recent"]));
  await act(() => result.current.more());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.entries).toEqual(["recent"]);
  await act(() => result.current.retry());
  await waitFor(() => expect(result.current.entries).toEqual(["recent", "old"]));
  expect(result.current.hasMore).toBe(false);
  expect(read.mock.calls.map((call) => call[0])).toEqual([undefined, "older", "older"]);
  expect(read.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
});

it("discards all displayed pages when a later read denies access", async () => {
  const read = vi
    .fn<PageSource<string>["read"]>()
    .mockResolvedValueOnce({ entries: ["private event"], nextCursor: "older" })
    .mockResolvedValueOnce(null);
  const { result } = setup(read);
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(() => result.current.more());
  await waitFor(() => expect(result.current.denied).toBe(true));
  expect(result.current.entries).toEqual([]);
  expect(result.current.hasMore).toBe(false);
});

it("can retry an initial failure without requesting an older page", async () => {
  const read = vi
    .fn<PageSource<string>["read"]>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ entries: [], nextCursor: null });
  const { result } = setup(read);
  await waitFor(() => expect(result.current.failed).toBe(true));
  await act(() => result.current.retry());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(read.mock.calls.map((call) => call[0])).toEqual([undefined, undefined]);
});
