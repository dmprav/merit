# Application intake

Applications owns case identity, intake status, current and historical material,
shared working revisions, staff summaries, contact assignment, and intake history. Its
[IntakeApplication](src/domain/model.ts) contains only those writable facts.
Reviews and recommendations are composed for reading by grantmaking.

[Commands](src/server/commands/intake.ts) authorize the current actor and own the
transaction. [Rules](src/domain/intake.ts) decide readiness and material transitions;
[persistence](src/server/persistence/commands/intake.ts) records accepted changes.
Unchanged saves keep their revision and create no history. Creation receipts survive
eligible deletion, so retrying a creation cannot recreate a deleted application.

Applications owns the history table, creation-receipt lookup, and atomic recording
of changes and actor provenance. Assembly supplies a
[transaction-bound collaborator](src/server/grant-work.ts) for downstream usage
checks. Any review request, assessment, or recommendation prevents deletion,
including a cancelled request.

## Preserve intake history

The [history codec](src/server/persistence/history-encoding.ts) writes
`{ formatVersion: 1, application, workingRevision }` under the caller's transaction
and case lock. Snapshots contain only intake facts; review and recommendation
histories stay with their owners. Creation and deletion use null for the missing
side. The format version is independent of material and concurrency revisions.

The [frozen schema](src/server/persistence/history-format.ts) validates stored
fields independently of live models. Question IDs are required and unique within
each collection. Renaming or reordering questions retains their identity. Reads
adapt the recorded facts without rewriting history; unsupported versions and
malformed payloads fail. The [JSON fixture](tests/fixtures/application-history.json)
checks the initial contract independently of live models, including exact amounts.
Actor and interface provenance remain on the enclosing change record.

Before the first deployment, recreate disposable development databases when the
format changes. After deployment, define an explicit reading strategy that
preserves recorded facts and unknown values. Bounded MCP `intake_change` reads
expose the original stored JSON, including its format version, so fingerprints
and chunk offsets describe the same record.

## Integrate and verify

`/api` is browser-safe; `/server` exposes authorized operations and the service
factory. Approved downstream commands share `/locks`; readers use `/schema`,
`/scope`, `/encoding`, and the frozen `/history` decoder. `/server/integrations` provides the round-usage check,
and `/server/demo` exposes trusted intake and authored-history insertion and demo cleanup.

The [web package](../web/package.json) owns intake and contact-selection editing,
revisions, recovery, and messages. Run `vp run @merit/applications#test`,
`vp run @merit/applications-web#test`, and affected
[composition tests](../../grantmaking/business/tests).
