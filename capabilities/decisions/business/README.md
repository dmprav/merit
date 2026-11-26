# Committee decisions

Decisions owns the funding decision a committee made outside Merit, recorded by a
program manager. A decision is kept apart from the [recommendation](../../recommendations/business/README.md)
that proposed it: only a decision commits funding. The [workflow](../../../docs/workflows/record-decisions.md)
owns the rules in prose.

[Domain rules](src/domain/decision.ts) validate the outcome, the amount the outcome
allows, its conditions, the reason, the deciding body, and the decision date, and decide
whether a save changes anything. [Commitment rules](src/domain/commitment.ts) calculate what a
decision reserves from the round budget and whether the budget holds it. Both are pure.

The [command](src/server/commands/decisions.ts) owns authorization, the transaction, and
the revision check. It takes the shared application case lock, which also locks the round,
so a save serializes against other commitments and against a budget change. It then reads
the current decision, appends the next version to `committee_decision_versions`, and calls
`recordAuditEvent` from [Audit](../../audit/business/README.md) in the same transaction.
Versions are never updated or deleted; the head revision is the current decision, and the
recorder (user, name at the time, web or MCP client) is stored beside it, apart from the
free-text deciding body.

`/api` holds the browser-safe request, the service interface, and the public JSON encoding
of results, including the budget figures a rejected commitment reports. `/server/integrations`
implements Decisions' part of two contracts it does not own: the
[application work](../../applications/business/src/server/grant-work.ts) that blocks deleting an
application with any decision and withdrawing one whose current decision commits funding,
and the [round work](../../rounds/business/src/server/grant-work.ts) that stops a budget change
below the committed total. `/schema` and `/scope` expose the table and read projections to
approved compositions, and `/server/demo` inserts the authored example decision.

The [web package](../web/package.json) owns the section, editor, history, and draft recovery.
Run `vp run @merit/decisions#test`, `vp run @merit/decisions-web#test`, and the
[decision integration tests](../../grantmaking/business/tests/decisions.integration.ts).
