# Autonomous Maintenance Scout

Audits Merit when enough has changed, proves each finding with something it ran,
and files it as an issue a work session can build from. Part of the loop in
[decision 0017](../../docs/decisions/0017-autonomous-maintenance-loop.md); only
Claude Code cloud sessions run it.

A scout session never edits repository files, opens pull requests, or deletes
`verifications/*.md`. Its outputs are issues filed through
[proposal.ts](../../tooling/agents/proposal.ts), cursor updates on pinned state
issue `#219` through [scout.ts](../../tooling/agents/scout.ts), and one commit per
failing-test finding on the session's own branch. Start with
[AGENTS.md](../../AGENTS.md).

## Check protocol

A scheduled task runs the check; it audits nothing itself.

1. `git fetch origin main`.
2. `vpx tooling/agents/scout.ts due`. It reads `origin/main` and `#219`, so the
   checkout need not be at the scan tip.
3. `{"status": "idle"}`: exit.
4. `{"status": "due", "runs": [...]}`: for each run, start one cloud session with
   `create_session` in the same environment and the prompt
   `Follow .agents/tasks/scout.md run protocol for run <id>`. Then exit; do not
   audit, file, or advance anything.

`due` lists the runs in descending `metric / threshold`. The thresholds are in
`SCOUT_RUN_POLICY` in [runs.ts](../../tooling/agents/scout/runs.ts):

| Run kind       | Id                         | Due when                                                               |
| -------------- | -------------------------- | ---------------------------------------------------------------------- |
| `change-batch` | `change-batch`             | 10 commits merged since its cursor                                     |
| `area`         | `area:<area>`              | 3000 changed lines in the area since its cursor                        |
| `mechanism`    | `mechanism:<mechanism id>` | 5 commits since its cursor touched the mechanism's contract or adapter |
| `records`      | `records`                  | 8 `verifications/<n>.md` files newer than its cursor's `lastPrNumber`  |

An area is a path's first two segments under `capabilities/`, `foundation/`,
`interfaces/`, and `tooling/`, else its first segment. Lockfiles, snapshots, images,
migration metadata, and `verifications/**` do not count as churn. A run never
audited measures from seven days ago.

## Run protocol

You were given one run id.

1. **Load context.** `vpx tooling/agents/scout.ts context --run <id>`. It fails
   unless the checkout is clean at `scanTipSha`; run the
   `git switch --detach <scanTipSha>` it names and retry. If the checkout has
   changes, stop and report them without advancing the cursor.
   `context` prints `run`, `scanTipSha`, `cursor`, `commits`, `changedFiles`,
   `matchedMechanisms`, `concerns`, `openIssues`, `wontfixIssues` (with each
   maintainer rejection `reason`), and, by run kind, `telemetry` (`area` and
   `mechanism` runs, filtered to the target; `capabilitySymmetry` for mechanisms,
   `entryWeights` for `app` and `interfaces/*` areas) or `unreadVerifications`
   (`records`). `commits` and `changedFiles` cover only the target's paths for
   `area` and `mechanism` runs.
2. **Audit the target against `concerns`, in order.** Each concern is a checklist
   below. The order is the weight: spend most effort on the first. Read each
   target file and its precedent in full before claiming a problem. Respect
   `trackedBy` on telemetry hotspots and clone groups: skip what an open or
   `wontfix` issue already tracks unless the root cause is clearly distinct.
3. **Prove each finding** (next section), then file it.
4. **File through `proposal.ts`.** One JSON object per finding on stdin of
   `vpx tooling/agents/proposal.ts` (add `--dry-run` to preview). Details below.
5. **Advance.** After inspection, even when nothing was filed:
   `vpx tooling/agents/scout.ts advance --run <id> --commit <scanTipSha>`. For
   `records`, add `--pr <highest verification record pull request number read>`.
   Do not advance when `context` or `proposal.ts` failed for an unfiled finding;
   the next check starts the run again.

## Evidence rules

A finding without executable evidence is not filed. A brief that cites code nobody
ran is a hypothesis, and the builder pays for testing it.

- **Behavioral bug:** write a failing test at the owning layer (see the testing
  guide), commit only that test to your session's own branch, one commit per
  finding, and push the branch. Evidence type `failing-test` with `command` (the
  test run), `output` (the failure excerpt), `branch`, `commit`, and `citations`
  to the production code at fault. `proposal.ts` fetches `origin/<branch>` and
  refuses to file unless `commit` is on it.
- **Test gap:** apply a focused mutation to production code (see
  [focused mutation checks](../../docs/guides/testing.md#focused-mutation-checks)),
  run the owning tests, and confirm they still pass. Revert the mutation; leave no
  mutation committed. Evidence type `surviving-mutation` with the command, the
  passing output, and `file:line` of the mutated code.
- **Anything else** (architecture, duplication, docs drift, security, query
  shape): the output of a command you actually ran, such as `vp run architecture`,
  `vp run code-health`, fallow, or the documented command that shows the problem,
  with `file:line` citations. Evidence type `command`.

`output` is the relevant excerpt only (at most 1500 characters).

## What to file

- **Bar:** there is no per-run finding cap and no fixed reading budget. File what
  is worth a pull request: a reviewer reads the diff, so do not file
  micro-proposals (a one-line wording tweak, a single missing assertion, an
  isolated style nit) unless the evidence shows a real defect or a guarded
  invariant.
- **Bundle within the audited target.** Several findings of one concern in one
  area, mechanism, or slice become one cohesive proposal, each with its evidence
  cited.
- **Do not repeat work** covered by `openIssues` or rejected in `wontfixIssues`;
  read `reason` to honor maintainer taste. `proposal.ts` also refuses a duplicate.
- **`kind`:** `"pr"` (default) for a change one pull request can carry, with a
  self-contained `brief` (`behavior`, `outOfScope`, `precedents`, `plan`,
  `verification`) a work session can build without asking anyone. `"design"` for
  a systemic finding that needs a maintainer decision or several pull requests,
  with bounded `design` fields (`options` 2-3, `recommendation`, `prSequence` 2-4
  where PR 1 ships alone, `openQuestions` 1-4).
- **Source:** `"run": "<run id>"` on every finding.
- **Fields:** `title`, `why`, `evidence` (`type`, `command`, `output`,
  `citations`, plus `branch` and `commit` for a failing test), `change`
  (1-5 single-line bullets), `decision`, `whyNot`, explicit `paths`, and
  `ambiguous: true` whenever intended behavior or a trade-off is unsettled. Keep
  every field a crisp single line (`output` aside). Never pass `agent:*` labels in
  `extraLabels`.

`proposal.ts` labels a `pr` finding `agent:ready` when it is unambiguous, and
`agent:proposed` otherwise (a design, an ambiguous brief, or a follow-up more than
two steps from its finding). It records the tier, which does not decide the label.

## Concern checklists

### `bugs-security`

Audit the target end to end across web, server, MCP, and database boundaries.

1. **Behavioral bugs:** logic that contradicts the documented workflow, unhandled
   states, off-by-one and rounding errors (money goes through `@merit/money`),
   races between reads and writes, and error paths that swallow failures.
2. **Authorization and RBAC:** missing or inconsistent checks
   (`capabilities/access/`) in server actions, loaders, API routes, and MCP tools,
   including IDOR and horizontal escalation.
3. **Tenant and organization isolation:** queries, mutations, storage keys, and
   cache entries that do not scope by organization, or accept caller-supplied ids
   across tenants.
4. **Validation and injection:** unvalidated external input, unsafe HTML, URL,
   iframe, or redirect handling, error messages that leak internal state or
   secrets, missing rate or size bounds.
5. **Supply chain and CI:** unpinned GitHub Actions, broad workflow permissions,
   unsafe secret handling.

### `architecture`

Read [architecture](../../docs/foundations/architecture.md),
[mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts),
and [rule enforcement](../../docs/guides/verification-tooling.md#rule-enforcement).

- Ownership leaks across capabilities, `serverImports` exception creep,
  shared-persistence leaks, and orchestration accumulating in
  `app/src/server/services.server.ts`.
- Views absorbing controller or domain state, save-versus-refresh drift,
  inconsistent draft or revision-baseline recovery.
- Eager router or bundle weight, repeated server-function adapter boilerplate,
  route loader, redirect, and error-translation drift.
- Feature views bypassing `@merit/ui`, `@merit/forms`, or `@merit/tables`;
  money and date boundary inconsistencies.
- Write-owning capabilities drifting on audit events; demo seeders diverging from
  example builders; inconsistent `instrumentService`, `reportError`, or analytics
  wiring.
- Recurring prose or review rules that belong higher on the enforcement ladder
  (lint, types, fallow, mechanisms, architecture tests), and growing `oxlint`
  disables or fallow overrides.
- For a `mechanism` run, check every adapter against the mechanism's `invariants`
  and `docs`.
- **Guardrail:** honor
  [design boundaries around behavior](../../docs/foundations/architecture.md#design-boundaries-around-behavior):
  "Neither implementation size nor the number of layers establishes its quality."
  Never propose splitting a file because of line count or density metrics. Every
  finding fixes a real coupling, ownership, bundle, invariant, or enforcement
  problem. Use `"kind": "design"` when the fix spans several pull requests or
  needs a maintainer architecture choice.

### `tests`

Read the [testing guide](../../docs/guides/testing.md) and
[verification guide](../../docs/guides/verification.md).

- **Owner feedback:** inspect merged pull requests in `commits` for review
  comments that asked to change, move, merge, or remove tests. Each is a defect
  pattern; scan the whole target for it.
- **Seven dimensions**, for the target's tests across all layers side by side:
  1. Owning layer: verified at the lowest layer that can observe it?
  2. Overlap: repeats another layer without
     [justification](../../docs/guides/testing.md#justify-overlapping-coverage)?
  3. Worth testing: asserts an outcome or contract, not call counts, framework
     behavior, discarded implementations, or restated constants?
  4. One behavior: independent setup, so rules fail independently?
  5. Assertion strength: would it fail if the rule broke? Prove a suspected gap
     with a surviving mutation.
  6. Test data: deciding values explicit; owning capability fixtures rather than
     demo records picked by position?
  7. Cohesion: consistent naming and fixtures, no near-duplicates differing only
     in incidental input?
- Include the owning package's full test command (`vp run @merit/<pkg>#test`) in
  the brief so coverage thresholds run, plus any touched integration, component,
  or browser suites.
- **Guardrails:** never propose removing the only test of a guarantee, lowering
  coverage thresholds, narrowing measured scope, adding coverage-ignore
  directives, or skipping a test, except as `ambiguous: true` for explicit owner
  approval ([coverage policy](../../docs/guides/testing.md#coverage-policy-changes)).
  Do not mix test cleanup with production edits; file production bugs separately.

### `simplification`

Read [coding conventions](../../docs/guides/coding-conventions.md) and
[engineering principles](../../docs/foundations/principles.md).

1. **Cross-file production clones** in `telemetry.cloneGroups` that can collapse
   onto an existing shared contract.
2. **Dead indirection:** pass-through wrappers, single-caller abstractions, and
   adapter glue that protects no boundary.
3. **Tangled modules** mixing unrelated responsibilities that can be simplified
   without changing capability boundaries.

**Guardrail:** preserve exact external behavior. No speculative rewrites,
stylistic churn, or LOC-driven splitting; every finding must measurably delete
complexity or duplication. Hand boundary redesigns to `architecture`.

### `mcp-db`

Audit MCP tools (`capabilities/*/ai`, `interfaces/mcp`, `app/tests/evals/mcp`) and
database layers (`foundation/db/`, capability repositories).

1. **Contracts and evals:** missing or weak MCP evals for real tool behavior,
   schema or permission mismatches between tools and domain services, tool
   contracts that invite agents to misuse mutations.
2. **Queries and indexes:** N+1 loops, unbounded `SELECT`s on growing tables, hot
   filter or join columns without a Drizzle index.
3. **Write integrity:** multi-step mutations missing transactions,
   revision checks, or idempotency guards.
4. **Guardrail:** never propose modifying or deleting applied SQL migrations under
   `foundation/db/database/migrations/*.sql`.

### `docs`

Read the [documentation guide](../../docs/guides/documentation.md) and
[docs/README.md](../../docs/README.md). Check docs affected by `commits` and every
document in the target against the code they describe. Prefer **shrinking,
pruning, and fixing real contradictions**:

- content superseded by a later decision, workflow, or implementation;
- explanations duplicated from their primary home (replace with a link);
- descriptions of code, commands, screens, or options that no longer exist;
- documents without a distinct reader task (merge into the owning page);
- detail that types, config, stories, or examples already explain;
- empty or redundant docs (remove and update inbound links);
- drift in the [drive-merit feature maps](../skills/drive-merit/SKILL.md#feature-maps-user-pov)
  when routes, workflows, or primary ARIA handles change.

**Guardrails:** cite the rule in the documentation guide a finding breaks; prefer
removal to rewriting; when code and docs disagree and intent is unclear, set
`ambiguous: true`. Skip a one- or two-line wording tweak unless it misleads
callers into bugs. Include `vp run check:docs` (and the public-doc checks in
`interfaces/site/src/features/docs/README.md` for site docs) in the brief.

### `verification`

Read the [verification guide](../../docs/guides/verification.md) and
[verification tooling](../../docs/guides/verification-tooling.md).

- **Inputs:** every file in `unreadVerifications`, with the pull request
  description and review threads when context is needed. For recurrence counting,
  also read records removed in the last 4 weeks:
  `git log --since='4 weeks ago' --diff-filter=D --format='commit %H' --name-only -- 'verifications/*.md'`
  (prior contents: `git show <commit>^:verifications/<pr>.md`).
- **Classify and count causes:**
  1. Could not verify: environment, runtime, credential, host, or unrelated check
     blockers.
  2. Did not verify: compare against the
     [verification guide](../../docs/guides/verification.md#verification); a skip
     the policy disallows is actionable once.
  3. Dismissed review findings: reviewer, request, dismissal reason; an invalid
     dismissal is actionable once.

  A cause recurs when it appears in **two or more records** inside the 4-week
  window. Leave harmless one-offs alone.

- **Fix routing:**
  - Environment blocks a check: update `.agents/install-environment.sh` or
    document the blocker.
  - Agents misjudge a documented check: tighten the owning guide.
  - CodeRabbit or Greptile repeats dismissed findings: tighten `.coderabbit.yaml`,
    `.greptile/rules.md`, or `.greptile/files.json` (keeping the parity
    `tooling/verification/docs.test.ts` verifies).
  - `feature-reviewer` repeats dismissed findings: tighten
    [review.md](../skills/build-feature/review.md) (within its 95-line, 4800-byte
    budget) or
    [mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts).
  - An unexplained CI flake or invalid dismissal: file a focused diagnosis issue
    citing the pull requests and the unchecked gap.
- **Never delete `verifications/*.md`.**
  [prune-verifications.yml](../../.github/workflows/prune-verifications.yml)
  removes records older than 30 days once `prNumber <= records.lastPrNumber`.
