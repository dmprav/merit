# Round preparation

Rounds owns configuration, budgets, responsibility, criteria versions, and round
change history. [Preparation rules](src/domain/preparation.ts) define accepted
transitions; [commands](src/server/commands/preparation.ts) authorize, lock, validate
revisions, and record changes atomically. Creation receipts survive deletion.

`@merit/rounds/api` is browser-safe. `@merit/rounds/server` supplies the service
factory and authorized operations. `/schema`, `/scope`, `/readers`, and `/encoding`
serve approved server readers; `/locks` exposes only the round lock. `/server/demo`
is reserved for trusted composition.

Applications owns case membership in a round. Assembly supplies the
[round-usage callback](src/server/grant-work.ts) to deletion; it checks the same
transaction while the round lock is held. A round containing any application
cannot be deleted. Rounds has no dependency on Applications or downstream judgments.

The [web package](../web/package.json) owns preparation controllers, draft recovery,
views and messages. Combined round screens remain in grantmaking. Run
`vp run @merit/rounds#test`, `vp run @merit/rounds-web#test`, and affected
[composition tests](../../grantmaking/business/tests/round-preparation.integration.ts).
