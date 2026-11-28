import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { AiReviewData } from "../../contracts/ai-review";
import { aiReviewDataFixture, aiReviewFixture } from "../../testing/ai-review.fixtures";
import { useAiReview } from "./use-ai-review";

const setup = (overrides: Partial<AiReviewData> = {}) => {
  const data = aiReviewDataFixture({
    run: vi
      .fn<AiReviewData["run"]>()
      .mockResolvedValue({ status: "ok", review: aiReviewFixture() }),
    refresh: vi.fn<AiReviewData["refresh"]>().mockResolvedValue(undefined),
    ...overrides,
  });
  return { data, ...renderHook(() => useAiReview(data)) };
};

/**
 * A page whose run answers `first` once, then saves. Its refresh completes and the page then reads
 * as `reloaded`; by default the page does not change.
 */
const setupPage = (
  first: Awaited<ReturnType<AiReviewData["run"]>>,
  {
    reloaded,
    ...overrides
  }: Partial<AiReviewData> & { reloaded?: AiReviewData["availability"] } = {},
) => {
  const page = aiReviewDataFixture({
    run: vi
      .fn<AiReviewData["run"]>()
      .mockResolvedValueOnce(first)
      .mockResolvedValue({ status: "ok", review: aiReviewFixture() }),
    refresh: vi.fn<AiReviewData["refresh"]>(async () => {
      if (reloaded) {
        rendered.rerender({ page: { ...page, availability: reloaded } });
      }
    }),
    ...overrides,
  });
  const rendered = renderHook(({ page: current }: { page: AiReviewData }) => useAiReview(current), {
    initialProps: { page },
  });
  return { ...rendered, page };
};

it("runs once at a time and refreshes the page after a saved review", async () => {
  let finish!: (result: Awaited<ReturnType<AiReviewData["run"]>>) => void;
  const run = vi.fn<AiReviewData["run"]>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, data } = setup({ run });

  act(() => void result.current?.run());
  act(() => void result.current?.run());
  await waitFor(() => expect(result.current?.running).toBe(true));
  expect(run).toHaveBeenCalledOnce();

  await act(async () => finish({ status: "ok", review: aiReviewFixture() }));
  await waitFor(() => expect(result.current?.running).toBe(false));
  expect(data.refresh).toHaveBeenCalledOnce();
  expect(result.current?.saved).toBe(1);
  expect(result.current?.failure).toBeNull();
});

it("reports a failed run without refreshing or counting a save", async () => {
  const { result, data } = setup({ run: vi.fn().mockResolvedValue({ status: "failed" }) });

  await act(() => result.current!.run());

  expect(result.current?.failure).toEqual({ kind: "failed" });
  expect(result.current?.saved).toBe(0);
  expect(data.refresh).not.toHaveBeenCalled();
});

it("clears the failure when the run is tried again", async () => {
  const run = vi
    .fn<AiReviewData["run"]>()
    .mockResolvedValueOnce({ status: "failed" })
    .mockResolvedValue({ status: "ok", review: aiReviewFixture() });
  const { result } = setup({ run });

  await act(() => result.current!.run());
  await act(() => result.current!.run());

  expect(run).toHaveBeenCalledTimes(2);
  expect(result.current?.failure).toBeNull();
  expect(result.current?.saved).toBe(1);
});

const refused = { status: "not_available", availability: "consent_required" } as const;

it("shows the reason a run was refused at save time and reloads the page", async () => {
  const { result, page } = setupPage(refused, { reloaded: "consent_required" });

  await act(() => result.current!.run());

  // The reloaded page now says the same, so the reason stands on its own.
  expect(result.current?.availability).toBe("consent_required");
  expect(result.current?.failure).toBeNull();
  // The reason ends the offer, so a further call cannot run.
  await act(() => result.current!.run());
  expect(page.run).toHaveBeenCalledOnce();
  expect(page.refresh).toHaveBeenCalledOnce();
});

it("holds the save-time reason until the page has been read again", async () => {
  let finish!: () => void;
  const refresh = vi.fn<AiReviewData["refresh"]>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = setupPage(refused, { refresh });

  act(() => void result.current?.run());
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(result.current?.availability).toBe("consent_required");
  expect(result.current?.failure).toEqual({
    kind: "not_available",
    availability: "consent_required",
  });

  await act(async () => finish());

  // The page read says it is available again, with the same reviews as before.
  expect(result.current?.availability).toBe("available");
  expect(result.current?.failure).toBeNull();
});

it("offers the run again when the page read after a refusal is unchanged", async () => {
  const { result, page } = setupPage(refused);

  await act(() => result.current!.run());

  expect(result.current?.availability).toBe("available");
  await act(() => result.current!.run());
  expect(page.run).toHaveBeenCalledTimes(2);
});

it("does not offer a run that the page already refuses", async () => {
  const { result, data } = setup({ availability: "withdrawn" });

  await act(() => result.current!.run());

  expect(result.current?.availability).toBe("withdrawn");
  expect(data.run).not.toHaveBeenCalled();
});

it.each([
  { name: "a missing application", response: { status: "not_found" } as const, kind: "accessLost" },
  { name: "a signed-out session", response: { status: "signed_out" } as const, kind: "accessLost" },
  {
    name: "an unreachable server",
    response: { status: "unavailable" } as const,
    kind: "unconfirmed",
  },
])("explains $name without claiming that nothing was saved", async ({ response, kind }) => {
  const { result } = setup({ run: vi.fn().mockResolvedValue(response) });

  await act(() => result.current!.run());

  expect(result.current?.failure).toEqual({ kind });
});

it("treats a thrown request as unconfirmed", async () => {
  const { result } = setup({ run: vi.fn().mockRejectedValue(new Error("Network")) });

  await act(() => result.current!.run());

  expect(result.current?.failure).toEqual({ kind: "unconfirmed" });
  expect(result.current?.running).toBe(false);
});

it("keeps the saved result when only the refresh fails and retries just the refresh", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const refresh = vi
      .fn<AiReviewData["refresh"]>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(undefined);
    const { result, data } = setup({ refresh });

    await act(async () => {
      const running = result.current!.run();
      await vi.advanceTimersByTimeAsync(4000);
      await running;
    });
    await waitFor(() => expect(result.current?.refreshError).toBe("saved"));
    expect(result.current?.failure).toBeNull();
    expect(result.current?.saved).toBe(1);

    await act(() => result.current!.refresh());

    expect(result.current?.refreshError).toBeNull();
    expect(data.run).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});

it("has no work without data", () => {
  const { result } = renderHook(() => useAiReview(null));

  expect(result.current).toBeNull();
});

it("sends a new run ID for each submission but keeps it when the outcome is unconfirmed", async () => {
  const run = vi
    .fn<AiReviewData["run"]>()
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "failed" })
    .mockResolvedValue({ status: "ok", review: aiReviewFixture() });
  const { result } = setup({ run });

  await act(() => result.current!.run());
  await act(() => result.current!.run());
  await act(() => result.current!.run());

  const ids = run.mock.calls.map(([id]) => id);
  expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(ids[1]).toBe(ids[0]);
  expect(ids[2]).not.toBe(ids[0]);
});
