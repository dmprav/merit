# Store and read private files

Use `createFileStorage` from `@merit/storage` with the
[server’s S3 adapter](../../app/src/server/file-objects.server.ts). The foundation
stores immutable bytes in a private bucket. Each capability owns its attachment
rows, including the relationship to its resource, filename, media type, uploader,
version history, and access rules.

## Write an attachment

Authorize the upload on the owning resource, then pass up to 25 MiB to
`storage.writeFile(bytes)`. The returned `FileReference` contains the server-generated
object key, byte length, and SHA-256 digest. Persist these three values in the
capability’s attachment record when committing the authorized business operation.
For example, Applications could link a proposal PDF to the submission version it supports.

Each call creates a fresh object, including calls with identical bytes. The owner
handles request retries and concurrent saves using its command receipt or a unique
constraint in its transaction. When a prior request committed, return the saved
attachment. When a write or commit acknowledgement is lost, resolve the owner’s
receipt before retrying. An uploaded object can outlive a rolled-back attachment.

## Read an attachment

Look up the attachment through the capability’s authorized resource query. Pass
its persisted reference to `storage.readFile(reference)` after releasing the
database connection. The foundation checks the length and digest before returning
the bytes. Keep bucket credentials and reference resolution on the server.

## Configure a bucket

Use a dedicated private bucket that accepts path-style S3 GET and conditional PUT
with Signature Version 4, supports `If-None-Match: *`, and denies anonymous reads.
The bucket and any intervening proxy must honor `Accept-Encoding: identity` on
GET and return the original object length. Give the server credentials to create and read
objects under `files/`. Production provider selection and provisioning belong to
deployment.

Set `FILE_STORAGE_ENDPOINT`, `FILE_STORAGE_REGION`, `FILE_STORAGE_BUCKET`,
`FILE_STORAGE_ACCESS_KEY_ID`, and `FILE_STORAGE_SECRET_ACCESS_KEY` in the Node
server environment. Use HTTPS outside loopback. For local development,
`docker compose up -d --wait` starts a private SeaweedFS bucket in a named volume.
The [environment example](../../app/.env.example) contains the matching settings.

## Retention and recovery

Each attachment owner decides how long its current and historical references
must stay readable. Retain recoverable object copies for the lifetime of database
backups that refer to them. After a restore, verify the referenced bytes before
resuming cleanup.

To reclaim orphaned objects:

1. Pause attachment writes and drain in-flight operations across all owners of the bucket.
2. Connect to the authoritative PostgreSQL primary for that bucket with a dedicated
   maintenance role that can read every owner's attachment records across all workspaces.
   The [application runtime role](../../docs/guides/deployment.md#check-runtime-privileges)
   has tenant-scoped visibility.
3. In a read-only transaction, run `SET LOCAL row_security = off` before scanning
   every owner's current and historical attachment references. PostgreSQL then
   raises an error if row security would filter a table. If any scan fails or
   complete coverage cannot be verified, stop before deleting any objects.
4. Keep writes paused while deleting verified unreferenced objects covered by the
   backup retention policy, then resume writes.
