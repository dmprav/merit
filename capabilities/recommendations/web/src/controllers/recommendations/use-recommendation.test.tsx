import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeReviewedApplication } from "@merit/grantmaking/testing/fixtures";

import type { RecommendationData, RecommendationFailure } from "../../contracts/recommendations";
import { DraftContext } from "./recommendation-drafts";
import { useRecommendation } from "./use-recommendation";

const application = applicationView(makeReviewedApplication());
const recommendation = application.managerRecommendation!;
const baseline = { expectedRevision: 2, expectedApplicationVersion: 1 };
const draft = { position: recommendation.position, amount: "100", reasoning: "My draft" };

const setup = () => {
  const save = vi.fn<RecommendationData["save"]>();
  const setDraft = vi.fn();
  const hook = renderHook(
    () => useRecommendation("application", application, { revision: 5, disabled: false, save }),
    {
      wrapper: ({ children }) => (
        <DraftContext
          value={{
            drafts: { application: { value: draft, baseline } },
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
