# Funding recommendations

Recommendations owns manager proposals, allocation calculations, immutable
recommendation versions, and audit coordination. A recommendation is a proposal;
recording it does not commit funding. [Domain rules](src/domain/recommendation.ts)
validate its position, explanation, material readiness, and financial facts.

The [command](src/server/commands/recommendations.ts) owns authorization, the
transaction, and revision checks. It uses the shared application case lock before
comparing the latest revision and appending to `recommendation_versions`. The latest
stored version defines the current revision; Applications holds no recommendation
counter. The command calls `recordAuditEvent` from
[Audit](../../audit/business/README.md) directly in that transaction, so the
recommendation version and audit event commit or roll back together.

`/api` contains browser-safe inputs, outcomes, and public JSON encoding. `/server`
exposes the service factory and authorized save. Approved composition reads use
`/schema`, `/scope`, and `/encoding`. Public field selection and stored-history
encoding remain separate contracts. Recommendation rules need application facts,
budget, and allocation totals; they do not import review implementation.

The [web package](../web/package.json) owns the editor, budget preview, draft recovery,
and messages. Run `vp run @merit/recommendations#test`,
`vp run @merit/recommendations-web#test`, and
[recommendation integration tests](../../grantmaking/business/tests/recommendations.integration.ts).
