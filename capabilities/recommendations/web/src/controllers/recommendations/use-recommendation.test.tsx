import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeReviewedApplication } from "@merit/grantmaking/testing/fixtures";

import type { RecommendationData, RecommendationFailure } from "../../contracts/recommendations";
import { DraftContext, useRecommendationDraftStore } from "./recommendation-drafts";
import { useRecommendation } from "./use-recommendation";

const application = applicationView(makeReviewedApplication());
const recommendation = application.managerRecommendation!;
const baseline = { expectedRevision: 2, expectedApplicationVersion: 1 };
const draft = { position: recommendation.position, amount: "100", reasoning: "My draft" };

const setup = (
  drafts: Record<string, { value: typeof draft; baseline: typeof baseline }> = {
    application: { value: draft, baseline },
  },
) => {
  const save = vi.fn<RecommendationData["save"]>();
  const setDraft = vi.fn();
  const hook = renderHook(
    () => useRecommendation("application", application, { revision: 5, disabled: false, save }),
    {
      wrapper: ({ children }) => (
        <DraftContext
          value={{
            ready: true,
            drafts,
            setDraft,
            clearDrafts: vi.fn(),
          }}
        >
          {children}
        </DraftContext>
      ),
    },
  );
  return { ...hook, save, setDraft };
};

it.each<RecommendationFailure>([
  { status: "conflict" },
  { status: "invalid", error: "application_not_ready" },
  { status: "not_found" },
  { status: "signed_out" },
  { status: "unavailable" },
])(
  "preserves a $status outcome and the original draft baseline without presentation dependencies",
  async (failure) => {
    const { result, save, setDraft } = setup();
    save.mockResolvedValue(failure);

    await act(async () => expect(await result.current.save(recommendation)).toEqual(failure));

    expect(save).toHaveBeenCalledExactlyOnceWith(recommendation, baseline);
    expect(result.current.draft).toEqual(draft);
    expect(result.current.saved).toBe(0);
    expect(setDraft).not.toHaveBeenCalled();
  },
);

it("keeps a thrown save retryable and records success only after commitment", async () => {
  const { result, save } = setup();
  save.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ status: "ok" });

  await act(async () =>
    expect(await result.current.save(recommendation)).toEqual({ status: "unavailable" }),
  );
  expect(result.current.saved).toBe(0);
  await act(async () => expect(await result.current.save(recommendation)).toBeNull());
  expect(result.current.saved).toBe(1);
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
});

it("saves a recommendation without a retained draft against the current revision and version", async () => {
  const { result, save } = setup({});
  save.mockResolvedValue({ status: "ok" });

  await act(async () => expect(await result.current.save(recommendation)).toBeNull());

  expect(save).toHaveBeenCalledExactlyOnceWith(recommendation, {
    expectedRevision: 5,
    expectedApplicationVersion: application.version,
  });
});

it("saves an edited draft against the revision it was started on after the revision advances", async () => {
  const save = vi.fn<RecommendationData["save"]>().mockResolvedValue({ status: "ok" });

  const Store = ({ children }: { children: ReactNode }) => (
    <DraftContext value={useRecommendationDraftStore("use-recommendation-test").value}>
      {children}
    </DraftContext>
  );

  const { result, rerender } = renderHook(
    ({ revision }) =>
      useRecommendation("application", application, { revision, disabled: false, save }),
    { initialProps: { revision: 5 }, wrapper: Store },
  );
  await waitFor(() => expect(result.current.ready).toBe(true));

  act(() => result.current.updateDraft(draft));
  rerender({ revision: 6 });
  act(() => result.current.updateDraft({ ...draft, reasoning: "Edited after the change" }));
  await act(async () => expect(await result.current.save(recommendation)).toBeNull());

  expect(save).toHaveBeenCalledExactlyOnceWith(recommendation, {
    expectedRevision: 5,
    expectedApplicationVersion: application.version,
  });
});
