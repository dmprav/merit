import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeApplication, makeReviewedApplication } from "@merit/grantmaking/testing/fixtures";

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
            conflicts: new Set(),
            resolveConflict: vi.fn(),
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

const renderStoredRecommendation = async (storageScope: string) => {
  const save = vi.fn<RecommendationData["save"]>().mockResolvedValue({ status: "ok" });

  const Store = ({ children }: { children: ReactNode }) => (
    <DraftContext value={useRecommendationDraftStore(storageScope).value}>{children}</DraftContext>
  );

  const hook = renderHook(
    ({ revision, version }) =>
      useRecommendation(
        "application",
        { ...application, version },
        { revision, disabled: false, save },
      ),
    { initialProps: { revision: 5, version: application.version }, wrapper: Store },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.updateDraft(draft));
  return { ...hook, save };
};

it("saves an edited draft against its original recommendation revision and application version", async () => {
  const { result, rerender, save } = await renderStoredRecommendation("use-recommendation-test");
  rerender({ revision: 6, version: makeApplication({ version: 2 }).version });
  act(() => result.current.updateDraft({ ...draft, reasoning: "Edited after the change" }));
  await act(async () => expect(await result.current.save(recommendation)).toBeNull());

  expect(save).toHaveBeenCalledExactlyOnceWith(recommendation, {
    expectedRevision: 5,
    expectedApplicationVersion: application.version,
  });
});

it("reports a record change when the saved recommendation advances under a draft", async () => {
  const { result, rerender } = await renderStoredRecommendation("record-change-test");
  expect(result.current.conflict).toBeNull();

  rerender({ revision: 6, version: application.version });

  expect(result.current.conflict).toBe("record_changed");
});

it("reports a basis change when the application version advances under a draft", async () => {
  const { result, rerender } = await renderStoredRecommendation("basis-change-test");

  rerender({ revision: 6, version: makeApplication({ version: 2 }).version });

  expect(result.current.conflict).toBe("basis_changed");
});

it("keeps a conflicted draft and saves it against the latest revision and version", async () => {
  const { result, rerender, save } = await renderStoredRecommendation("keep-draft-test");
  rerender({ revision: 6, version: makeApplication({ version: 2 }).version });

  act(() => result.current.keepDraft());

  expect(result.current.conflict).toBeNull();
  expect(result.current.draft).toEqual(draft);
  await act(async () => expect(await result.current.save(recommendation)).toBeNull());
  expect(save).toHaveBeenCalledExactlyOnceWith(recommendation, {
    expectedRevision: 6,
    expectedApplicationVersion: 2,
  });
});

it("discards a conflicted draft and resets the editor when loading the latest", async () => {
  const { result, rerender } = await renderStoredRecommendation("load-latest-test");
  rerender({ revision: 6, version: application.version });

  act(() => result.current.loadLatest());

  expect(result.current.conflict).toBeNull();
  expect(result.current.draft).toBeUndefined();
  expect(result.current.draftReset).toBe(1);
});

const renderStoreConflict = () => {
  const storedDraft = {
    value: { position: recommendation.position, amount: "200", reasoning: "Stored tab draft" },
    baseline: { expectedRevision: 5, expectedApplicationVersion: application.version },
  };
  const store: {
    drafts: Record<string, typeof storedDraft>;
    conflicts: Set<string>;
    finishUseStored?: () => void;
  } = {
    drafts: { application: { ...storedDraft, value: draft } },
    conflicts: new Set(["application"]),
  };

  const hook = renderHook(
    () =>
      useRecommendation("application", application, {
        revision: 5,
        disabled: false,
        save: vi.fn<RecommendationData["save"]>(),
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DraftContext
          value={{
            ready: true,
            drafts: store.drafts,
            conflicts: store.conflicts,
            resolveConflict: (_key, choice) => {
              if (choice === "keep") {
                store.conflicts = new Set();
                return Promise.resolve();
              }
              return new Promise<void>((resolve) => {
                store.finishUseStored = () => {
                  store.drafts = { application: storedDraft };
                  store.conflicts = new Set();
                  resolve();
                };
              });
            },
            setDraft: vi.fn(),
            clearDrafts: vi.fn(),
          }}
        >
          {children}
        </DraftContext>
      ),
    },
  );
  return { ...hook, store, storedDraft };
};

it("reports a draft changed in another tab as a record change", () => {
  const { result } = renderStoreConflict();

  expect(result.current.conflict).toBe("record_changed");
  expect(result.current.draft).toEqual(draft);
});

it("keeps this tab's draft when resolving a draft changed in another tab", () => {
  const { result, rerender } = renderStoreConflict();

  act(() => result.current.keepDraft());
  rerender();

  expect(result.current.conflict).toBeNull();
  expect(result.current.draft).toEqual(draft);
});

it("resets the editor only after the other tab's stored draft has loaded", async () => {
  const { result, rerender, store, storedDraft } = renderStoreConflict();

  act(() => result.current.loadLatest());
  expect(result.current.draftReset).toBe(0);

  await act(async () => store.finishUseStored?.());
  rerender();

  expect(result.current.conflict).toBeNull();
  expect(result.current.draft).toEqual(storedDraft.value);
  expect(result.current.draftReset).toBe(1);
});
