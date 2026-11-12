# Recover unfinished browser work

`@merit/drafts` persists local writing in IndexedDB through Dexie. Drafts survive
navigation, reload, and reopening the same browser profile. They remain local to
the device and account; server saves and recorded application versions belong to
the owning capability. Browser storage can be unavailable or removed, so retain
in-memory editing and report recovery failures.

## Use a draft store

Call `useDrafts(scope, kind, format)` once in a feature provider and share its
returned values across entry points. `scope` identifies the account (including
the demo identity where applicable), `kind` identifies the workflow, and record
keys include the workspace and record or section identity. Omit `scope` for
memory-only previews. Scope or format changes create a fresh store.

The feature supplies a stable Zod schema and a format version. Schemas accept
unfinished input, including invalid form values, and retain the original server
revision and retry identity. Submission validation remains with the feature.

```ts
const drafts = useDrafts(accountScope, "contacts", {
  version: 1,
  schema: contactDraftSchema,
});

// Mount editors after drafts.ready. Updates replace the record map without mutating it.
drafts.update((previous) => ({ ...previous, [recordKey]: editedValues }));
drafts.update((previous) => ({ ...previous, [recordKey]: undefined }));
```

`drafts` contains the recovered values. `ready` means the restore attempt finished,
including failure. Wait for it before mounting editors so initial form values
cannot replace recovered writing. `status` distinguishes `restoring`, `saving`,
`saved`, `unavailable`, `conflict`, `cleared`, and memory-only `memory`.
`storageUnavailable` covers persistence failures and tab conflicts. A local
`saved` status means the IndexedDB transaction committed, not that the server has
saved the work. Writes continue after navigation unmounts a provider.
The editor asks for confirmation before leaving while writes are pending or
writing remains only in memory after a storage failure or conflict.

When storage fails, input remains in memory. Another edit retries failed writes.
If restoration failed, recovery never adopts a write baseline for unseen saved
content. Keep the tab open until writing has been saved or discarded.

## Protect drafts across tabs and account changes

Each record has an internal write token. A transaction compares the token read
by this editor with the stored token before writing. Different records can save
independently. When two tabs edit the same draft, the first successful write
remains stored and the other tab reports `conflict` while retaining its writing
in memory. Save that writing through the feature or discard it before closing;
reopen the page to restore the stored recovery copy. This is separate from a
server revision conflict and does not merge business records.

Clearing one draft never removes another tab's newer copy. Deletion tombstones
prevent stale tabs from recreating discarded drafts. These tokens are technical
concurrency controls and are unrelated to application material versions.

Await `clearDrafts(scope)` when replacing a demo; omit the scope for sign-out or
an account change. Cleanup immediately invalidates mounted stores, waits for
queued operations, and clears stored records transactionally. Scope epochs
reject writes from old editors in other tabs. A cleared store cannot write again; account composition
remounts it. The result is `false` if browser storage could not be cleared;
in-memory stores are still cleared. Cleanup is best-effort when storage is blocked.

## Validate stored writing

Features own payload schemas and format versions. Recovery accepts only the exact
version requested by the editor and validates the stored value against its schema.
Unsupported versions and malformed payloads remain stored and report recovery
unavailability; editing another record cannot erase them. There is no payload
migration or session-storage import path.

Before the first deployment, reset disposable browser data when changing a draft
format. Clear the site's browser storage after closing its tabs, then reopen it.
After deployment, define a recovery or migration policy before changing a format
that people may have saved. Database schema upgrades remain private to this package.

## Maintain recovery behavior

The [draft store](src/store.ts) owns editing state, queued writes, and recovery
outcomes through a small [persistence contract](src/persistence.ts). Its lifecycle
distinguishes restoration, editable state, and terminal clearing; per-record tokens,
failures, and incompatible payloads remain separate. Late storage completions cannot
revive a cleared store, and storage recovery never adopts tokens for unseen writing.

The [session coordinator](src/sessions.ts) retains unmounted stores until their
queued work settles, makes replacement editors wait for preceding writes, and
invalidates affected stores before account cleanup waits for completion. The
[browser adapter](src/browser.ts) binds persistence and unload warnings; the React
hook subscribes to the resulting store.

[Storage restoration](src/storage.ts) reads the current scope and saved writing
transactionally. [Payload decoding](src/format.ts) is pure; token checks,
scope epochs, and deletion tombstones stay inside storage transactions.

## Verify a consumer

Package tests retain recovery, format validation, concurrent writes, deletion, failure,
and cleanup checks through the same hook used by features. Additional Node tests
exercise the store and session coordinator with controlled asynchronous completions,
without React or browser storage, and verify payload decoding independently.
Run both groups with `vp run @merit/drafts#test`. Consumer tests use
`fake-indexeddb/auto`, with `resetDraftStorage` from `@merit/drafts/testing` between
tests. `readDraftStorage` inspects committed recovery values without exposing
Dexie tables. `seedDraftStorage` supplies current-format fixtures for consumer tests.
Real-browser checks cover reopening tabs and simultaneous editors.
