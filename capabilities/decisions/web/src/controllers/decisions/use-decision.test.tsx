import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import type { DecisionData, DecisionDraft, DecisionFailure } from "../../contracts/decisions";
import { DraftContext } from "./decision-drafts";
import { useDecision } from "./use-decision";

const draft: DecisionDraft = {
  outcome: "Fund",
  amount: "100",
  conditions: "",
  reason: "My draft",
  decidedBy: "Funding committee",
  decisionDate: "2026-01-18",
  changeExplanation: "",
};
const baseline = { expectedRevision: 2 };
const decision = {
  outcome: "Fund" as const,
  amount: fromMinorUnits(10000n),
  conditions: "",
  reason: "My draft",
  decidedBy: "Funding committee",
  decisionDate: "2026-01-18",
};

const setup = ({
  drafts = { application: { value: draft, baseline } },
  conflicts = new Set<string>(),
  revision = 2,
}: {
  drafts?: Record<string, { value: DecisionDraft; baseline: typeof baseline }>;
  conflicts?: Set<string>;
  revision?: number;
} = {}) => {
  const save = vi.fn<DecisionData["save"]>();
  const setDraft = vi.fn();
  const resolveConflict = vi.fn(async () => {});
  const hook = renderHook(
    () => useDecision("application", { revision, versions: [], disabled: false, save }),
    {
      wrapper: ({ children }) => (
        <DraftContext
          value={{
            ready: true,
            drafts,
            conflicts,
            resolveConflict,
            setDraft,
            clearDrafts: vi.fn(),
          }}
        >
          {children}
        </DraftContext>
      ),
    },
  );
  return { ...hook, save, setDraft, resolveConflict };
};

it.each<DecisionFailure>([
  { status: "conflict" },
  { status: "invalid", error: "application_not_ready" },
  { status: "not_found" },
  { status: "signed_out" },
  { status: "unavailable" },
])("preserves a $status outcome and the original draft baseline", async (failure) => {
  const { result, save, setDraft } = setup();
  save.mockResolvedValue(failure);

  await act(async () => expect(await result.current.save(decision)).toEqual(failure));

  expect(save).toHaveBeenCalledExactlyOnceWith(decision, baseline);
  expect(result.current.draft).toEqual(draft);
  expect(result.current.saved).toBe(0);
  expect(setDraft).not.toHaveBeenCalled();
});

it("keeps a thrown save retryable and records success only after commitment", async () => {
  const { result, save } = setup();
  save.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ status: "ok" });

  await act(async () =>
    expect(await result.current.save(decision)).toEqual({ status: "unavailable" }),
  );
  expect(result.current.saved).toBe(0);
  await act(async () => expect(await result.current.save(decision)).toBeNull());
  expect(result.current.saved).toBe(1);
});

it("saves without a retained draft against the current revision", async () => {
  const { result, save } = setup({ drafts: {}, revision: 4 });
  save.mockResolvedValue({ status: "ok" });

  await act(async () => expect(await result.current.save(decision)).toBeNull());

  expect(save).toHaveBeenCalledExactlyOnceWith(decision, { expectedRevision: 4 });
  expect(result.current.conflict).toBeNull();
});

it("reports a conflict when the saved decision moved past the draft's baseline", () => {
  const { result } = setup({ revision: 3 });
  expect(result.current.conflict).toBe("record_changed");
});

it("reports a conflict raised by another tab's stored draft", () => {
  const { result } = setup({ conflicts: new Set(["application"]) });
  expect(result.current.conflict).toBe("record_changed");
});

it("lets a person reaffirm the draft against the latest decision", () => {
  const { result, setDraft } = setup({ revision: 3 });

  act(() => result.current.keepDraft());

  expect(setDraft).toHaveBeenCalledExactlyOnceWith(
    "application",
    draft,
    { expectedRevision: 3 },
    true,
  );
});

it("resolves another tab's stored conflict by keeping or loading it", async () => {
  const { result, resolveConflict } = setup({ conflicts: new Set(["application"]) });

  act(() => result.current.keepDraft());
  expect(resolveConflict).toHaveBeenCalledWith("application", "keep");
  await act(async () => result.current.loadLatest());
  expect(resolveConflict).toHaveBeenCalledWith("application", "use_stored");
  expect(result.current.draftReset).toBe(1);
});

it("discards the draft and loads the latest decision", () => {
  const { result, setDraft } = setup({ revision: 3 });

  act(() => result.current.loadLatest());

  expect(setDraft).toHaveBeenCalledExactlyOnceWith(
    "application",
    undefined,
    { expectedRevision: 3 },
    true,
  );
  expect(result.current.draftReset).toBe(1);
});

it("does nothing to keep a draft that no longer exists", () => {
  const { result, setDraft } = setup({ drafts: {} });
  act(() => result.current.keepDraft());
  expect(setDraft).not.toHaveBeenCalled();
});

it("updates the draft against the current revision", () => {
  const { result, setDraft } = setup({ drafts: {}, revision: 6 });
  act(() => result.current.updateDraft(draft));
  expect(setDraft).toHaveBeenCalledExactlyOnceWith("application", draft, { expectedRevision: 6 });
});
