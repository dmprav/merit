# Store and read private files

The capability that owns an attachment decides who may create or read it.
Use `createFileStorage` from `@merit/storage` with the
[server's S3 adapter](../../app/src/server/file-objects.server.ts).

For a write, open the owning capability's transaction, authorize the action on
the specific resource, then call `storage.writeFile(tx, { organizationId, uploadedBy }, upload)`.
Derive those IDs from the authorized resource and authenticated actor.
The upload carries a request UUID, original filename, MIME type and up to 25 MiB
of bytes. On success, save the returned file ID on the owner's attachment in the
same transaction. Reference `workspace_files(organization_id, id)` together so a
resource can only link a file in its own workspace. A rolled-back attachment
also rolls back the file metadata.

For multiple attachments in one transaction, await each write before starting
the next. Each write uses a savepoint so a failed upload releases its receipt
even when the owner handles the failure and commits other work.

For a read, select the attachment through the owner's authorized resource query
and join its file row using `workspaceFiles` from `@merit/storage/schema`.
After releasing the database connection, pass that persisted row to
`storage.readFile(file)` to retrieve bytes verified against its length and SHA-256.
Always resolve this row on the server. A client-supplied file ID or metadata
cannot establish the right to download it.

PostgreSQL enforces tenant isolation in workspace and assignment transactions.
Within that boundary, the owner's rule can distinguish, for example, a program
manager's application materials from a reviewer's assigned evidence.

## Retry a write

The workspace and request ID uniquely identify the write. Concurrent attempts
wait on the same PostgreSQL uniqueness constraint. A committed retry by the
same actor with identical bytes, name and MIME type returns the original file.
Reusing the request with different content, metadata or actor returns
`conflict` after the caller passes the owning capability's permission check.

The transaction reserves a new file ID and issues a conditional S3 PUT while
the metadata is uncommitted. Storage must support `If-None-Match: *`. Readers
can see the row only after the PUT succeeds and the transaction commits.
An interrupted upload or commit can leave a private object without a row.
Retry with the same request ID. A committed row is reused, while a rolled-back
attempt receives a fresh key. The service never deletes an object on a failed
commit acknowledgement because the commit may already have succeeded.

## Configure a bucket

Dedicate one private bucket to each Merit database. The provider must support
path-style S3 GET and conditional PUT with Signature Version 4, return content
length on GET, and deny anonymous reads. Give the server credentials to read
and create objects under `files/`. Keep listing and deletion with the cleanup
operator. Production provider and bucket provisioning are deployment choices.

Set `FILE_STORAGE_ENDPOINT`, `FILE_STORAGE_REGION`, `FILE_STORAGE_BUCKET`,
`FILE_STORAGE_ACCESS_KEY_ID` and `FILE_STORAGE_SECRET_ACCESS_KEY` in the Node
server environment. Use HTTPS outside loopback. The
[local environment example](../../app/.env.example) matches the private
SeaweedFS service in [Compose](../../compose.yaml). Running
`docker compose up -d --wait` provisions the local bucket and preserves it in
a named volume across restarts. Copy the five settings to `app/.env.local` for Vite development and preview,
or export them in the server shell.

## Reconcile unreferenced objects

An operator can reclaim objects left after an interrupted write or removal of a
workspace. List candidate keys under `files/` in the configured bucket first.
Preserve a recoverable copy of immutable objects for the full retention period
of every database backup that can reference them. After a restore, verify that
each restored row resolves to bytes matching its saved digest before enabling
writes or cleanup. For a live reconciliation, connect to the matching
authoritative PostgreSQL primary as the table owner,
with visibility across all workspaces. Use a short batch during a quiet period.

1. Begin a transaction at `READ COMMITTED` and run
   `LOCK TABLE workspace_files IN SHARE MODE`. This waits for pending file
   insertions to commit or roll back and prevents new insertions until release.
2. After the lock succeeds, look up each exact candidate with
   `SELECT id FROM workspace_files WHERE object_key = $1`. Keep every
   referenced object.
3. While holding that lock, delete only the checked keys with no matching row.
   Commit to release writers. If either connection fails, repeat the check in a
   new transaction before issuing another delete.

Age and filename alone cannot establish that a file is unreferenced. Never use
a tenant-scoped runtime connection for this comparison. The
[database and storage integration tests](../../app/tests/file-storage.integration.ts)
exercise private access and byte preservation against the Compose service.
