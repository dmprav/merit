import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

import { createKeyedDrafts } from "./index";

const schema = z.object({
  value: z.object({ text: z.string() }),
  baseline: z.object({ expectedRevision: z.number() }),
});
const { DraftContext, useDraftStore, useKeyedDrafts } = createKeyedDrafts("notes", schema);

const mount = () => renderHook(() => useDraftStore("account"));

it("keeps the baseline a draft began from unless asked to replace it", async () => {
  const store = mount();
  await waitFor(() => expect(store.result.current.ready).toBe(true));

  act(() => store.result.current.value.setDraft("a", { text: "one" }, { expectedRevision: 1 }));
  act(() => store.result.current.value.setDraft("a", { text: "two" }, { expectedRevision: 2 }));
  expect(store.result.current.value.drafts.a).toEqual({
    value: { text: "two" },
    baseline: { expectedRevision: 1 },
  });

  act(() =>
    store.result.current.value.setDraft("a", { text: "two" }, { expectedRevision: 2 }, true),
  );
  expect(store.result.current.value.drafts.a?.baseline).toEqual({ expectedRevision: 2 });

  act(() => store.result.current.value.setDraft("a", undefined, { expectedRevision: 2 }));
  expect(store.result.current.value.drafts.a).toBeUndefined();

  act(() => store.result.current.value.setDraft("b", { text: "x" }, { expectedRevision: 0 }));
  act(() => store.result.current.value.clearDrafts());
  expect(store.result.current.value.drafts).toEqual({});
});

it("reads the provided store and refuses to run without one", () => {
  expect(() => renderHook(() => useKeyedDrafts())).toThrow("GrantmakingDrafts is required");

  const store = mount();
  const read = renderHook(() => useKeyedDrafts(), {
    wrapper: ({ children }) => (
      <DraftContext value={store.result.current.value}>{children}</DraftContext>
    ),
  });
  expect(read.result.current.drafts).toEqual({});
});
