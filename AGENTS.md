# Working on Merit

Build coherent capabilities that help people understand evidence and carry out grant work. Start with [docs](docs/README.md) and [foundations](docs/foundations/README.md), then inspect shared contracts, the closest implementation, and its tests before editing.

## Rules and architecture

- **Domain & precedents:** Follow [domain-driven design](docs/foundations/architecture.md#model-grant-work-explicitly). Before substantive edits, name your reference implementation, what you will reuse or extend, and which behavior stays consistent.
- **Principles:** Read the matching card in [engineering principles](docs/foundations/principles.md) when triggered; cite a principle only when it changed a decision.
- **Enforcement ladder:** Escalate recurring mistakes up **architecture -> types -> lint or CI -> tests -> documentation**. Check [rule enforcement](docs/guides/verification-tooling.md#rule-enforcement) for static checks (`check:code`, `architecture`, `code-health`, `test:stories`, `check:css`, `check:docs`, `check:security`) and prose rules.
- **Workflow skills:** Read and follow the matching skill in `.agents/skills/` (`build-feature`, `fix-bug`, `diagnose`, `drive-merit`, `grill`, `handoff`, `implement-proposal`).

## Complete the change

- Keep each PR focused on one verifiable outcome with implementation, affected interfaces, tests, and docs.
- Run the smallest check set covering changed behavior and boundaries per [verification](docs/guides/verification.md); reuse passing results when inputs did not change.
- Follow the [coverage policy](docs/guides/testing.md#coverage-policy-changes) (explicit user approval before weakening tests/coverage), [documentation guide](docs/guides/documentation.md), and [commit conventions](docs/guides/development.md#commit-changes).

## Agent delegation

- Route bulk reading and exploration to subagents with file pointers and concise briefs.
- Give mutating reviewers and parallel workers separate git worktrees (`vp run worktree:create`); for multi-round or multi-session work, record decisions with `vp run agent:ledger` and transfer context with `handoff`, starting review-fix rounds and retries in a fresh subagent rather than a bloated context.
