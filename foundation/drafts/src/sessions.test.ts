import { expect, it } from "vite-plus/test";

import { deferred } from "../tests/deferred";
import type { DraftRecovery } from "./persistence";
import { DraftSessions } from "./sessions";
import { DraftStore } from "./store";

const recovery = (value?: string): DraftRecovery<string> => ({
  epoch: "session",
  drafts: value === undefined ? {} : { record: value },
  tokens: new Map(),
  incompatible: new Set(),
});

it("retains unmounted writes for a replacement editor without blocking other scopes or workflows", async () => {
  const sessions = new DraftSessions();
  const writing = deferred<void>();
  const finish = deferred<void>();
  let stored: string | undefined;
  const storage = {
    restore: async () => recovery(stored),
    write: async () => {
      writing.resolve();
      await finish.promise;
      stored = "Writing from the previous editor";
      return {
        status: "saved" as const,
        tokens: new Map<string, string>(),
        conflicts: new Set<string>(),
      };
    },
  };
  const first = new DraftStore(storage);
  const unmount = sessions.register("account", "applications", first);
  await first.whenIdle();
  first.update(() => ({ record: "Writing from the previous editor" }));
  await writing.promise;
  unmount();

  const replacement = new DraftStore(storage);
  sessions.register("account", "applications", replacement);
  const otherAccount = new DraftStore(storage);
  sessions.register("other-account", "applications", otherAccount);
  const otherWorkflow = new DraftStore(storage);
  sessions.register("account", "contacts", otherWorkflow);
  await Promise.all([otherAccount.whenIdle(), otherWorkflow.whenIdle()]);
  expect(replacement.getSnapshot().status).toBe("restoring");
  expect(otherAccount.getSnapshot().status).toBe("saved");
  expect(otherWorkflow.getSnapshot().status).toBe("saved");

  finish.resolve();
  await replacement.whenIdle();
  expect(replacement.getSnapshot().drafts.record).toBe("Writing from the previous editor");
});

it("invalidates unmounted writers immediately and waits for them before completing cleanup", async () => {
  const sessions = new DraftSessions();
  const writing = deferred<void>();
  const finish = deferred<void>();
  const first = new DraftStore({
    restore: async () => recovery(),
    write: async () => {
      writing.resolve();
      await finish.promise;
      return { status: "saved", tokens: new Map(), conflicts: new Set() };
    },
  });
  const unmount = sessions.register("account", "applications", first);
  const other = new DraftStore<string>();
  sessions.register("other-account", "applications", other);
  other.update(() => ({ record: "Other account writing" }));
  await first.whenIdle();
  first.update(() => ({ record: "Pending writing" }));
  await writing.promise;
  unmount();
  let finished = false;
  const cleanup = sessions.invalidate("account").then(() => {
    finished = true;
  });
  expect(first.getSnapshot()).toMatchObject({ status: "cleared", drafts: {} });
  expect(other.getSnapshot().drafts.record).toBe("Other account writing");
  await Promise.resolve();
  expect(finished).toBe(false);
  finish.resolve();
  await cleanup;
  expect(finished).toBe(true);
  expect(first.getSnapshot()).toMatchObject({ status: "cleared", drafts: {} });
  await sessions.invalidate();
  expect(other.getSnapshot()).toMatchObject({ status: "cleared", drafts: {} });
});

it("keeps a remounted session registered until its last user leaves", async () => {
  const sessions = new DraftSessions();
  const store = new DraftStore<string>();
  const unmount = sessions.register("account", "applications", store);
  unmount();
  sessions.register("account", "applications", store);
  await store.whenIdle();
  store.update(() => ({ record: "Still mounted" }));
  await sessions.invalidate("account");
  expect(store.getSnapshot()).toMatchObject({ status: "cleared", drafts: {} });
});

it("releases an unmounted session once its work has settled", async () => {
  const sessions = new DraftSessions();
  const store = new DraftStore<string>();
  const unmount = sessions.register("account", "applications", store);
  store.update(() => ({ record: "Released" }));
  unmount();
  await store.whenIdle();
  await sessions.invalidate();
  expect(store.getSnapshot()).toMatchObject({ status: "memory", drafts: { record: "Released" } });
});
