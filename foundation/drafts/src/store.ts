import type { DraftPersistence, DraftRecovery, DraftWrite, DraftWriteResult } from "./persistence";
import type { DraftSnapshot, DraftStatus, DraftValues } from "./types";

type Lifecycle =
  | { phase: "idle" | "restoring" }
  | { phase: "ready"; pendingWrites: number }
  | { phase: "cleared" };

type RecoveryState = {
  epoch?: string;
  tokens: Map<string, string>;
  failures: Map<string, "conflict" | "unavailable">;
  incompatible: Set<string>;
};

export class DraftStore<T> {
  private readonly persistence?: DraftPersistence<T>;
  private readonly initial: DraftSnapshot<T>;
  private snapshot: DraftSnapshot<T>;
  private lifecycle: Lifecycle;
  private recovery: RecoveryState = {
    tokens: new Map(),
    failures: new Map(),
    incompatible: new Set(),
  };
  private pending = Promise.resolve();
  private listeners = new Set<() => void>();
  private keyRevisions = new Map<string, number>();

  constructor(persistence?: DraftPersistence<T>) {
    this.persistence = persistence;
    this.lifecycle = persistence ? { phase: "idle" } : { phase: "ready", pendingWrites: 0 };
    this.initial = {
      drafts: {},
      status: persistence ? "restoring" : "memory",
      ready: !persistence,
      storageUnavailable: false,
      conflicts: new Set(),
    };
    this.snapshot = this.initial;
  }

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.initial;
  whenIdle = () => this.pending;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private status(): DraftStatus {
    const { lifecycle, recovery } = this;
    if (lifecycle.phase === "cleared") {
      return "cleared";
    }
    if (!this.persistence) {
      return "memory";
    }
    if (lifecycle.phase !== "ready") {
      return "restoring";
    }
    if (lifecycle.pendingWrites) {
      return "saving";
    }
    if ([...recovery.failures.values()].includes("conflict")) {
      return "conflict";
    }
    return !recovery.epoch || recovery.failures.size ? "unavailable" : "saved";
  }

  private publish(drafts = this.snapshot.drafts) {
    const status = this.status();
    const conflicts = new Set(
      [...this.recovery.failures.entries()]
        .filter(([, failure]) => failure === "conflict")
        .map(([key]) => key),
    );
    this.snapshot = {
      drafts,
      status,
      ready: status !== "restoring",
      storageUnavailable:
        status !== "cleared" &&
        (this.recovery.failures.size > 0 || status === "unavailable" || status === "conflict"),
      conflicts,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  start = (precedingWrites: Promise<void> = Promise.resolve()) => {
    if (this.lifecycle.phase === "idle") {
      this.lifecycle = { phase: "restoring" };
      this.pending = this.restore(precedingWrites);
    }
  };

  private isCleared() {
    return this.lifecycle.phase === "cleared";
  }

  private async restore(precedingWrites: Promise<void>) {
    let drafts = this.snapshot.drafts;
    try {
      await precedingWrites;
      if (this.isCleared() || !this.persistence) {
        return;
      }
      const result = await this.persistence.restore();
      if (this.isCleared()) {
        return;
      }
      this.recovery = {
        epoch: result.epoch,
        tokens: result.tokens,
        incompatible: result.incompatible,
        failures: new Map([...result.incompatible].map((key) => [key, "unavailable"])),
      };
      drafts = result.drafts;
    } catch {
      // An absent epoch keeps failed restoration unavailable without blocking in-memory editing.
    }
    if (!this.isCleared()) {
      this.lifecycle = { phase: "ready", pendingWrites: 0 };
      this.publish(drafts);
    }
  }

  update = (change: (previous: DraftValues<T>) => DraftValues<T>) => {
    if (this.isCleared()) {
      return;
    }
    if (this.lifecycle.phase !== "ready") {
      throw new Error("Wait for draft restoration before editing");
    }
    const previous = this.snapshot.drafts;
    const next = change(previous);
    if (!this.persistence) {
      this.publish(next);
      return;
    }
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const changes = [...keys]
      .filter(
        (key) =>
          JSON.stringify(previous[key]) !== JSON.stringify(next[key]) ||
          this.recovery.failures.has(key),
      )
      .map((key) => ({ key, value: next[key] }));
    if (!changes.length) {
      return;
    }
    for (const { key } of changes) {
      this.keyRevisions.set(key, (this.keyRevisions.get(key) ?? 0) + 1);
    }
    this.lifecycle.pendingWrites += 1;
    this.pending = this.pending.then(() => this.persist(changes));
    this.publish(next);
  };

  private async recoverStorage(persistence: DraftPersistence<T>) {
    if (this.recovery.epoch) {
      return;
    }
    const result = await persistence.restore();
    if (this.isCleared()) {
      return;
    }
    this.recovery.epoch = result.epoch;
    // Never adopt a write token for content the person did not see before editing.
    this.publish({ ...result.drafts, ...this.snapshot.drafts });
  }

  private acceptWrite(changes: DraftWrite[], result: DraftWriteResult) {
    if (result.status === "cleared") {
      this.invalidate();
      return;
    }
    const { failures, incompatible, tokens } = this.recovery;
    for (const change of changes) {
      failures.delete(change.key);
      if (change.value === undefined) {
        incompatible.delete(change.key);
      }
    }
    for (const [key, token] of result.tokens) {
      tokens.set(key, token);
    }
    for (const key of result.conflicts) {
      failures.set(key, "conflict");
    }
  }

  private async persist(changes: DraftWrite[]) {
    if (this.isCleared() || !this.persistence) {
      return;
    }
    try {
      await this.recoverStorage(this.persistence);
      if (this.isCleared()) {
        return;
      }
      const writable = changes.filter(
        ({ key, value }) => !this.recovery.incompatible.has(key) || value === undefined,
      );
      const result = await this.persistence.write(
        this.recovery.epoch,
        writable.map((change) => ({ ...change, token: this.recovery.tokens.get(change.key) })),
      );
      if (!this.isCleared()) {
        this.acceptWrite(writable, result);
      }
    } catch {
      if (!this.isCleared()) {
        for (const { key } of changes) {
          this.recovery.failures.set(key, "unavailable");
        }
      }
    }
    if (this.lifecycle.phase === "ready") {
      this.lifecycle.pendingWrites -= 1;
      this.publish();
    }
  }

  resolveConflict = (key: string, choice: "keep" | "use_stored") => {
    if (this.isCleared() || this.lifecycle.phase !== "ready") {
      return;
    }
    if (!this.persistence) {
      return;
    }
    const revision = this.keyRevisions.get(key) ?? 0;
    this.lifecycle.pendingWrites += 1;
    this.pending = this.pending.then(() => this.applyConflictResolution(key, choice, revision));
    this.publish();
  };

  private async commitConflictChoice(
    persistence: DraftPersistence<T>,
    key: string,
    choice: "keep" | "use_stored",
    latest: DraftRecovery<T>,
    latestToken: string | undefined,
    revision: number,
  ) {
    this.recovery.failures.delete(key);
    this.recovery.incompatible.delete(key);
    if ((this.keyRevisions.get(key) ?? 0) !== revision) {
      return;
    }
    if (choice === "use_stored") {
      if (latest.incompatible.has(key)) {
        this.recovery.incompatible.add(key);
        this.recovery.failures.set(key, "unavailable");
      } else {
        this.publish({ ...this.snapshot.drafts, [key]: latest.drafts[key] });
      }
      return;
    }
    const currentValue = this.snapshot.drafts[key];
    const result = await persistence.write(this.recovery.epoch, [
      { key, value: currentValue, token: latestToken },
    ]);
    if (!this.isCleared()) {
      this.acceptWrite([{ key, value: currentValue }], result);
    }
  }

  private async applyConflictResolution(
    key: string,
    choice: "keep" | "use_stored",
    revision: number,
  ) {
    if (this.isCleared() || !this.persistence) {
      return;
    }
    try {
      const latest = await this.persistence.restore();
      if (this.isCleared()) {
        return;
      }
      if (this.recovery.epoch && latest.epoch !== this.recovery.epoch) {
        this.invalidate();
        return;
      }
      this.recovery.epoch ??= latest.epoch;
      const latestToken = latest.tokens.get(key);
      if (latestToken === undefined) {
        this.recovery.tokens.delete(key);
      } else {
        this.recovery.tokens.set(key, latestToken);
      }
      await this.commitConflictChoice(this.persistence, key, choice, latest, latestToken, revision);
    } catch {
      if (!this.isCleared()) {
        this.recovery.failures.set(key, "unavailable");
      }
    }
    if (this.lifecycle.phase === "ready") {
      this.lifecycle.pendingWrites -= 1;
      this.publish();
    }
  }

  invalidate = () => {
    this.lifecycle = { phase: "cleared" };
    this.publish({});
  };
}
