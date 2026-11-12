import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { database } from "./database";
import { useDrafts, clearDrafts } from "./index";
import { clearStoredDrafts } from "./storage";
import * as storage from "./storage";

const schema = z.object({ text: z.string(), revision: z.number(), requestId: z.string() });
const format = { version: 1, schema };
const draft = { text: "Unfinished writing", revision: 3, requestId: "same-retry" };

const mount = (scope: string | undefined = "account", kind = "applications") =>
  renderHook(() => useDrafts(scope, kind, format));

type DraftView = Pick<ReturnType<typeof mount>, "result">;

const ready = async (view: DraftView) =>
  waitFor(() => expect(view.result.current.ready).toBe(true));

const saved = async (view: DraftView) =>
  waitFor(() => expect(view.result.current.status).toBe("saved"));

afterEach(() => vi.restoreAllMocks());

it("recovers writing and original save boundaries after session storage and the tab are gone", async () => {
  const first = mount();
  await ready(first);
  act(() => first.result.current.update(() => ({ "workspace/application": draft })));
  expect(first.result.current.status).toBe("saving");
  await saved(first);
  first.unmount();
  sessionStorage.clear();
  const reopened = mount();
  await ready(reopened);
  expect(reopened.result.current.drafts).toEqual({ "workspace/application": draft });
});

it("isolates account, workflow and workspace record identities", async () => {
  const first = mount();
  await ready(first);
  act(() => first.result.current.update(() => ({ "alder/application": draft })));
  await saved(first);
  const otherAccount = mount("someone-else");
  const otherWorkflow = mount("account", "contacts");
  await ready(otherAccount);
  await ready(otherWorkflow);
  expect(otherAccount.result.current.drafts).toEqual({});
  expect(otherWorkflow.result.current.drafts).toEqual({});
  expect(first.result.current.drafts["birch/application"]).toBeUndefined();
});

it("lets separate tabs persist different records without erasing sibling drafts", async () => {
  const first = mount();
  const second = mount();
  await ready(first);
  await ready(second);
  act(() => {
    first.result.current.update(() => ({ a: draft }));
    second.result.current.update(() => ({ b: { ...draft, text: "Other writing" } }));
  });
  await saved(first);
  await saved(second);
  const reopened = mount();
  await ready(reopened);
  expect(reopened.result.current.drafts).toEqual({
    a: draft,
    b: { ...draft, text: "Other writing" },
  });
});

it("preserves both the winning recovery copy and conflicting writing in the other tab", async () => {
  const first = mount();
  const second = mount();
  await ready(first);
  await ready(second);
  act(() => first.result.current.update(() => ({ record: draft })));
  await saved(first);
  const conflicting = { ...draft, text: "My other tab" };
  act(() => second.result.current.update(() => ({ record: conflicting })));
  await waitFor(() => expect(second.result.current.status).toBe("conflict"));
  expect(second.result.current.drafts.record).toEqual(conflicting);
  expect(second.result.current.storageUnavailable).toBe(true);
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  act(() => second.result.current.update(() => ({ record: undefined })));
  await saved(second);
  const reopened = mount();
  await ready(reopened);
  expect(reopened.result.current.drafts.record).toEqual(draft);
});

it("prevents an old tab from resurrecting a discarded draft", async () => {
  const first = mount();
  await ready(first);
  act(() => first.result.current.update(() => ({ record: draft })));
  await saved(first);
  const second = mount();
  await ready(second);
  act(() => first.result.current.update(() => ({ record: undefined })));
  await saved(first);
  act(() => second.result.current.update(() => ({ record: { ...draft, text: "Stale edit" } })));
  await waitFor(() => expect(second.result.current.status).toBe("conflict"));
  const reopened = mount();
  await ready(reopened);
  expect(reopened.result.current.drafts).toEqual({});
});

it("clears queued writes and memory for the chosen scope while leaving other work recoverable", async () => {
  const real = mount("real");
  const demo = mount("demo");
  await ready(real);
  await ready(demo);
  act(() => real.result.current.update(() => ({ record: draft })));
  await saved(real);
  await act(async () => {
    demo.result.current.update(() => ({ record: draft }));
    expect(await clearDrafts("demo")).toBe(true);
  });
  expect(demo.result.current.drafts).toEqual({});
  expect(demo.result.current.status).toBe("cleared");
  const reopened = mount("demo");
  await ready(reopened);
  expect(reopened.result.current.drafts).toEqual({});
  expect(real.result.current.drafts.record).toEqual(draft);
  await act(async () => {
    await clearDrafts();
  });
  expect(real.result.current.drafts).toEqual({});
});

it("retains writing in memory after a failed write and persists it when storage recovers", async () => {
  const view = mount();
  await ready(view);
  const write = vi.spyOn(database.drafts, "put").mockRejectedValue(new Error("Quota"));
  act(() => view.result.current.update(() => ({ record: draft })));
  await waitFor(() => expect(view.result.current.status).toBe("unavailable"));
  expect(view.result.current.drafts.record).toEqual(draft);
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  write.mockRestore();
  act(() => view.result.current.update((current) => current));
  await saved(view);
  const reopened = mount();
  await ready(reopened);
  expect(reopened.result.current.drafts.record).toEqual(draft);
});

it("finishes a failed restoration and protects unseen saved data when storage recovers", async () => {
  const first = mount();
  await ready(first);
  act(() => first.result.current.update(() => ({ record: draft })));
  await saved(first);
  const read = vi.spyOn(database.scopes, "get").mockRejectedValue(new Error("Unavailable"));
  const second = mount();
  await ready(second);
  expect(second.result.current.status).toBe("unavailable");
  read.mockRestore();
  act(() =>
    second.result.current.update(() => ({ record: { ...draft, text: "Unseen overwrite" } })),
  );
  await waitFor(() => expect(second.result.current.status).toBe("conflict"));
  expect((await database.drafts.get(["account", "applications", "record"]))?.value).toEqual(draft);
});

it("keeps unscoped previews in memory without accessing browser storage", () => {
  const open = vi.spyOn(database, "transaction");
  const view = renderHook(() => useDrafts(undefined, "applications", format));
  act(() => view.result.current.update(() => ({ record: draft })));
  expect(view.result.current).toMatchObject({
    drafts: { record: draft },
    status: "memory",
    ready: true,
  });
  expect(open).not.toHaveBeenCalled();
});

it("finishes the previous editor's queued write before restoring after navigation", async () => {
  const first = mount();
  await ready(first);
  act(() => first.result.current.update(() => ({ record: draft })));
  first.unmount();
  const second = mount();
  await ready(second);
  expect(second.result.current.drafts.record).toEqual(draft);
});

it.each([undefined, "account"])(
  "rejects stale writes after another browser context clears %s",
  async (scope) => {
    const first = mount();
    await ready(first);
    act(() => first.result.current.update(() => ({ record: draft })));
    await saved(first);
    // Another browser has its own mounted-store registry and only shares IndexedDB.
    await clearStoredDrafts(scope);
    const reopened = mount();
    await ready(reopened);
    act(() => first.result.current.update(() => ({ record: { ...draft, text: "Late edit" } })));
    await waitFor(() => expect(first.result.current.status).toBe("cleared"));
    expect(first.result.current.drafts).toEqual({});
    expect(await database.drafts.count()).toBe(0);
  },
);

it.each([0, 2])(
  "preserves incompatible payload version %s while saving another record",
  async (version) => {
    const first = mount();
    await ready(first);
    act(() => first.result.current.update(() => ({ record: draft })));
    await saved(first);
    first.unmount();
    await database.drafts.update(["account", "applications", "record"], { version });
    const stored = await database.drafts.get(["account", "applications", "record"]);
    const next = mount();
    await ready(next);
    expect(next.result.current.status).toBe("unavailable");
    expect(next.result.current.drafts).toEqual({});
    act(() => next.result.current.update(() => ({ another: draft })));
    await waitFor(async () =>
      expect((await database.drafts.get(["account", "applications", "another"]))?.value).toEqual(
        draft,
      ),
    );
    expect(next.result.current.status).toBe("unavailable");
    expect(await database.drafts.get(["account", "applications", "record"])).toEqual(stored);
  },
);

it("resets synchronously when the hook's account scope changes", async () => {
  const view = renderHook(({ scope }) => useDrafts(scope, "applications", format), {
    initialProps: { scope: "account" },
  });
  await ready(view);
  act(() => view.result.current.update(() => ({ record: draft })));
  await saved(view);
  view.rerender({ scope: "other-account" });
  expect(view.result.current.drafts).toEqual({});
  await ready(view);
  expect(view.result.current.drafts).toEqual({});
});

it("warns before leaving while persistence is pending, and stops after commitment", async () => {
  const view = mount();
  await ready(view);
  act(() => view.result.current.update(() => ({ record: draft })));
  const pending = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  await saved(view);
  const committed = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(committed);
  expect(committed.defaultPrevented).toBe(false);
});

it("keeps recovery and cleanup registered through Strict Mode's effect remount", async () => {
  const view = renderHook(() => useDrafts("account", "applications", format), {
    wrapper: StrictMode,
  });
  await ready(view);
  act(() => view.result.current.update(() => ({ record: draft })));
  await saved(view);
  await act(async () => {
    expect(await clearDrafts("account")).toBe(true);
  });
  expect(view.result.current.drafts).toEqual({});
  expect(view.result.current.status).toBe("cleared");
});

it("removes the browser unload warning when an editor unmounts", async () => {
  const view = mount();
  await ready(view);
  const write = vi.spyOn(database.drafts, "put").mockRejectedValue(new Error("Quota"));
  act(() => view.result.current.update(() => ({ record: draft })));
  await waitFor(() => expect(view.result.current.status).toBe("unavailable"));
  view.unmount();
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(false);
  write.mockRestore();
});

it("reports failed account cleanup while still removing mounted drafts from memory", async () => {
  const view = mount();
  await ready(view);
  act(() => view.result.current.update(() => ({ record: draft })));
  await saved(view);
  const write = vi.spyOn(database.scopes, "clear").mockRejectedValue(new Error("Blocked"));
  await act(async () => {
    expect(await clearDrafts()).toBe(false);
  });
  expect(view.result.current.drafts).toEqual({});
  expect(view.result.current.status).toBe("cleared");
  write.mockRestore();
});

it("does not restore or write drafts when cleanup interrupts a storage retry", async () => {
  const read = vi.spyOn(storage, "restoreDrafts").mockRejectedValue(new Error("Unavailable"));
  const write = vi.spyOn(storage, "writeDrafts");
  const view = mount();
  await ready(view);
  const restored = {
    epoch: "previous-account",
    drafts: { record: draft },
    tokens: new Map([["record", "previous-token"]]),
    incompatible: new Set<string>(),
  };
  let finish!: (value: typeof restored) => void;
  read.mockReturnValueOnce(new Promise<typeof restored>((resolve) => (finish = resolve)));
  act(() => view.result.current.update(() => ({ record: draft })));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  let cleared!: Promise<boolean>;
  act(() => {
    cleared = clearDrafts("account");
  });
  expect(view.result.current.drafts).toEqual({});
  await act(async () => {
    finish(restored);
    expect(await cleared).toBe(true);
  });
  expect(write).not.toHaveBeenCalled();
  expect(view.result.current.drafts).toEqual({});
  expect(view.result.current.status).toBe("cleared");
});
