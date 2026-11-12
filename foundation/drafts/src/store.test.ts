import { expect, it, vi } from "vite-plus/test";

import { deferred } from "../tests/deferred";
import type { DraftPersistence, DraftRecovery, DraftWriteResult } from "./persistence";
import { DraftStore } from "./store";

const recovered = (): DraftRecovery<string> => ({
  epoch: "account-session",
  drafts: {},
  tokens: new Map(),
  incompatible: new Set(),
});

const committed = (token = "committed"): DraftWriteResult => ({
  status: "saved",
  tokens: new Map([["record", token]]),
  conflicts: new Set(),
});

const persistence = () => ({
  restore: vi.fn<DraftPersistence<string>["restore"]>().mockResolvedValue(recovered()),
  write: vi.fn<DraftPersistence<string>["write"]>().mockResolvedValue(committed()),
});

it("serializes overlapping edits with the preceding write's token while keeping the newest input", async () => {
  const storage = persistence();
  const writing = deferred<void>();
  const firstCommit = deferred<DraftWriteResult>();
  storage.write.mockImplementationOnce(() => {
    writing.resolve();
    return firstCommit.promise;
  });
  const store = new DraftStore(storage);
  store.start();
  await store.whenIdle();

  store.update(() => ({ record: "First edit" }));
  await writing.promise;
  store.update(() => ({ record: "Latest edit" }));
  expect(store.getSnapshot()).toMatchObject({
    status: "saving",
    drafts: { record: "Latest edit" },
  });
  expect(storage.write).toHaveBeenCalledTimes(1);

  firstCommit.resolve(committed("first-token"));
  await store.whenIdle();
  expect(storage.write).toHaveBeenLastCalledWith("account-session", [
    { key: "record", value: "Latest edit", token: "first-token" },
  ]);
  expect(store.getSnapshot()).toMatchObject({ status: "saved", drafts: { record: "Latest edit" } });
});

it("retains a failed write and retries unchanged input against its original token", async () => {
  const storage = persistence();
  storage.restore.mockResolvedValue({
    ...recovered(),
    drafts: { record: "Original" },
    tokens: new Map([["record", "original-token"]]),
  });
  storage.write.mockRejectedValueOnce(new Error("Unavailable"));
  const store = new DraftStore(storage);
  store.start();
  await store.whenIdle();
  store.update(() => ({ record: "Keep this writing" }));
  await store.whenIdle();
  expect(store.getSnapshot()).toMatchObject({
    status: "unavailable",
    storageUnavailable: true,
    drafts: { record: "Keep this writing" },
  });

  store.update((current) => current);
  await store.whenIdle();
  expect(storage.write).toHaveBeenLastCalledWith("account-session", [
    { key: "record", value: "Keep this writing", token: "original-token" },
  ]);
  expect(store.getSnapshot()).toMatchObject({ status: "saved", storageUnavailable: false });
});

it("does not adopt tokens for unseen content when a failed restoration recovers", async () => {
  const storage = persistence();
  storage.restore.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue({
    ...recovered(),
    drafts: { record: "Unseen writing", other: "Recovered sibling" },
    tokens: new Map([["record", "unseen-token"]]),
  });
  storage.write.mockResolvedValue({
    status: "saved",
    tokens: new Map(),
    conflicts: new Set(["record"]),
  });
  const store = new DraftStore(storage);
  store.start();
  expect(() => store.update(() => ({}))).toThrow("Wait for draft restoration");
  await store.whenIdle();
  expect(store.getSnapshot()).toMatchObject({ status: "unavailable", ready: true });

  store.update(() => ({ record: "My writing" }));
  await store.whenIdle();
  expect(storage.write).toHaveBeenCalledWith("account-session", [
    { key: "record", value: "My writing", token: undefined },
  ]);
  expect(store.getSnapshot()).toMatchObject({
    status: "conflict",
    drafts: { record: "My writing", other: "Recovered sibling" },
  });
});

it("keeps clearing terminal when the initial restoration finishes late", async () => {
  const storage = persistence();
  const reading = deferred<void>();
  const restore = deferred<DraftRecovery<string>>();
  storage.restore.mockImplementation(() => {
    reading.resolve();
    return restore.promise;
  });
  const store = new DraftStore(storage);
  store.start();
  await reading.promise;
  store.invalidate();
  restore.resolve({ ...recovered(), drafts: { record: "Old account writing" } });
  await store.whenIdle();
  store.start();
  store.update(() => ({ record: "Late edit" }));
  expect(store.getSnapshot()).toEqual({
    drafts: {},
    status: "cleared",
    ready: true,
    storageUnavailable: false,
  });
  expect(storage.restore).toHaveBeenCalledTimes(1);
  expect(storage.write).not.toHaveBeenCalled();
});

it("does not write after clearing interrupts a retry of failed restoration", async () => {
  const storage = persistence();
  storage.restore.mockRejectedValueOnce(new Error("Unavailable"));
  const store = new DraftStore(storage);
  store.start();
  await store.whenIdle();
  const reading = deferred<void>();
  const restore = deferred<DraftRecovery<string>>();
  storage.restore.mockImplementationOnce(() => {
    reading.resolve();
    return restore.promise;
  });
  store.update(() => ({ record: "Unsaved writing" }));
  await reading.promise;
  store.invalidate();
  restore.resolve({ ...recovered(), drafts: { record: "Old writing" } });
  await store.whenIdle();
  expect(storage.write).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toMatchObject({ drafts: {}, status: "cleared" });
});

it.each(["commit", "conflict", "failure"] as const)(
  "ignores a late write %s and cancels queued edits after clearing",
  async (outcome) => {
    const storage = persistence();
    const writing = deferred<void>();
    const write = deferred<DraftWriteResult>();
    storage.write.mockImplementationOnce(() => {
      writing.resolve();
      return write.promise;
    });
    const store = new DraftStore(storage);
    store.start();
    await store.whenIdle();
    store.update(() => ({ record: "First edit" }));
    await writing.promise;
    store.update(() => ({ record: "Queued edit" }));
    store.invalidate();
    const cleared = store.getSnapshot();
    if (outcome === "failure") {
      write.reject(new Error("Unavailable"));
    } else {
      write.resolve(
        outcome === "commit"
          ? committed()
          : {
              status: "saved",
              tokens: new Map(),
              conflicts: new Set(["record"]),
            },
      );
    }
    await store.whenIdle();
    expect(store.getSnapshot()).toBe(cleared);
    expect(storage.write).toHaveBeenCalledTimes(1);
  },
);
