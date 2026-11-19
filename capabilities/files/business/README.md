# Store and read private files

Server-side grant workflows can use the `files` service from
[application service assembly](../../../app/src/server/services.server.ts). Pass the
authenticated actor and the workspace slug to each call. Both reads and writes
require current `work_on_grants` authority. PostgreSQL limits metadata to the
selected workspace. Only the server holds object-store credentials.

`writeFile(actor, { workspaceSlug, requestId, originalFilename, mimeType, bytes })`
accepts a `Uint8Array` of up to 25 MiB, including empty files. This limit bounds
each buffered upload while the server holds its workspace and membership locks.
Use a fresh UUID for each logical upload and reuse it for retries. A successful
write returns `status: "ok"` and the stored file. PostgreSQL assigns its ID,
opaque object key and creation time. The server records the actor, supplied name
and MIME type, actual byte count and SHA-256 digest. Treat the supplied name and
type as descriptive input when presenting a file.

`readFile(actor, { workspaceSlug, fileId })` returns the saved metadata and
verified bytes. An inaccessible workspace, insufficient authority, or unknown
file returns `not_found` before contacting object storage. Malformed input and
storage failures throw. No browser or MCP route exposes these operations.

## Retry a write

The workspace and request ID uniquely identify the write. Concurrent attempts
wait on the same PostgreSQL uniqueness constraint. A committed retry by the
same actor with identical bytes, name and MIME type returns the original file.
Reusing the request with different content, metadata or actor returns
`conflict` after the caller passes the workspace permission check.

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
[local environment example](../../../app/.env.example) matches the private
SeaweedFS service in [Compose](../../../compose.yaml). Running
`docker compose up -d --wait` provisions the local bucket and preserves it in
a named volume across restarts. Copy the five settings to `app/.env.local` for Vite development and preview,
or export them in the server shell.

## Reconcile unreferenced objects

An operator can reclaim objects left after an interrupted write or removal of a
workspace. List candidate keys under `files/` in the configured bucket first.
Connect to the matching authoritative PostgreSQL primary as the table owner,
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
[database and storage integration tests](../../../app/tests/file-storage.integration.ts)
exercise private access and byte preservation against the Compose service.
