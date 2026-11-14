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

Applications owns creation-receipt lookup and the intake payload recorded atomically
through [Audit](../../audit/business/README.md), including actor provenance. Assembly supplies a
[transaction-bound collaborator](src/server/grant-work.ts) for downstream usage
checks. Any review request, assessment, or recommendation prevents deletion,
including a cancelled request.

## Withdraw and reinstate

A withdrawal is an optional [`withdrawal`](src/domain/model.ts) on the case, stored in its
own column and orthogonal to readiness: the retained `intakeStatus`, working revision,
and material version are never changed or lost. `isWithdrawn` is the one predicate for
withdrawn work. [`prepareIntakeChange`](src/domain/intake.ts) rejects every change but
`reinstate` with `application_withdrawn`, and the web and MCP `withdraw` and `reinstate`
changes share its schemas. `lockApplicationCase` reports whether the locked case is
withdrawn, so reviews, recommendations, and contact selection reject writes inside
their own transactions; `readCaseWithdrawn` answers the same for a case the caller
already locked. Persistence exports the SQL form of the predicate from `/scope` (`caseWithdrawn`, `activeCase(alias)`, `withdrawnCase(alias)`, and `roundWithdrawnCount`); every total, list, and sibling allocation uses them rather than writing `withdrawal is null`.

Withdrawing also calls the collaborator's `closeReviewsForWithdrawal` in the same
transaction, after the case lock. Reviews owns the closure of outstanding requests
and their assignments; applications does not know how. Reinstatement recomputes the
requested-total limit like an amount change, and does not reopen anything the
withdrawal closed.

## Support workspace search

`application_cases` stores the current recorded title and applicant organization
(`search_title`, `search_applicant`) beside `material_version`. Every write that
advances `material_version` updates them in the same statement, so working
revisions, unrecorded drafts, and superseded versions never match a search. The
migration backfilled existing rows from their current version, and demo seeding
goes through the same write. `applicationSearchMatch` and `applicationSearchRank`
in the [scope projections](src/server/persistence/projections.ts) build the match and
quality SQL over those columns with the shared helpers in
[`@merit/db/search`](../../../foundation/db/src/search.ts); Grantmaking composes
them with access and the round title and never reads the columns itself. An
expression index on the folded text lets PostgreSQL search thousands of applications
without loading them.

## Preserve intake history

The [history codec](src/server/persistence/history-encoding.ts) writes
`{ formatVersion: 1, application, workingRevision }` under the caller's transaction
and case lock. Snapshots contain only intake facts, including any withdrawal; review and recommendation
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
