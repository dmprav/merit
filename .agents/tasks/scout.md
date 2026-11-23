# Autonomous Maintenance Scout

Read-only scheduled audit of Merit across seven specialized lenses. This task
**never** edits repository files, commits changes, opens pull requests, or
deletes `verifications/*.md` files. Its only outputs are concise, decision-ready
proposal issues created through
[proposal.ts](../../tooling/agents/proposal.ts) and cursor updates on pinned
state issue `#219` via [scout.ts](../../tooling/agents/scout.ts).

Start with [AGENTS.md](../../AGENTS.md) and the guide for the lens you are
running.

## Run protocol

Every scheduled run targets **one lens** — either `--lens auto` (recommended for
scheduled runs; picks the most overdue lens from `#219` cursors) or an explicit
`--lens <lens>`: `docs`, `tests`, `verification-flakes`, `architecture`,
`simplification`, `security`, or `mcp-db`.

1. **Load deterministic context:**
   Run `vpx tooling/agents/scout.ts context --lens auto` (or pass a specific
   `--lens <lens>`). Inspect `status` (`"ready"`, `"idle"`, or `"cap_reached"`):
   - If `status` is `"idle"` (`all_lenses_fresh`), exit cleanly without
     advancing any cursor.
   - If `status` is `"cap_reached"`, exit cleanly without advancing any cursor.
   - When `status` is `"ready"`, record the emitted `lens`, `scanTipSha`,
     `commits`, `changedFiles`, `matchedMechanisms`, `rotationTarget`,
     `unreadVerifications`, `openIssues`, and `wontfixIssues`.
2. **Respect the proposal cap:**
   While running in calibration mode (`--tier2-only`), every proposal lands in
   `agent:proposed` (capped at 5 open issues). Leaving the cursor untouched on
   `cap_reached` ensures findings wait until the maintainer triages open
   proposals.
3. **Inspect the codebase using the emitted `lens` rules below:**
   - Do not repeat work already covered by `openIssues` or rejected in
     `wontfixIssues`.
   - File at most **2 high-signal proposals per run**. Prefer zero proposals over
     speculative churn.
   - Read every target file and its named precedent in full before proposing a
     change.
4. **Emit proposals through `proposal.ts`:**
   Pipe one JSON object per finding into:
   `vpx tooling/agents/proposal.ts --tier2-only`

   > **Calibration mode:** Keep `--tier2-only` enabled until two clean cycles
   > confirm Tier 1 precision, then drop `--tier2-only` so unambiguous Tier 1
   > `docs` and single-slice `tests` proposals land directly in `agent:ready`.

   Every JSON payload must satisfy `proposalInputSchema` in
   [proposal.ts](../../tooling/agents/proposal.ts):
   - **Review summary (compact for human scanning):** `why` (≤220 chars),
     `evidence` (≤200 chars, file paths + lines or PR numbers), `change` (1–3
     single-line bullets ≤140 chars), `decision` (≤200 chars, why this approach),
     `whyNot` (≤200 chars, main alternative rejected).
   - **Scope & flags:** explicit `paths` (avoid globs unless truly multi-file),
     `ambiguous: true` whenever intended behavior, policy, or trade-offs are
     unsettled. Never pass `agent:*` labels in `extraLabels`.
   - **Self-contained `brief`:** `behavior`, `outOfScope`, `precedents`, `plan`,
     and `verification` commands so
     [implement-proposal](../skills/implement-proposal/SKILL.md) can execute
     without interactive grilling.

5. **Advance the lens cursor:**
   Only after finishing inspection — and **not** if `scout.ts context` returned
   `status: "idle"` / `status: "cap_reached"` or `proposal.ts` returned
   `status: "cap_reached"` for an unfiled finding — run with the **explicit**
   emitted `lens` (never `--lens auto`):
   `vpx tooling/agents/scout.ts advance --lens <lens> --commit <scanTipSha>`
   For `verification-flakes`, also pass `--pr <highestUnreadPrNumber>` when
   `unreadVerifications` was non-empty.

## Incremental and rotation lenses

### `docs`

Read [documentation guide](../../docs/guides/documentation.md) and
[docs/README.md](../../docs/README.md).

- **Recent-merge impact:** From `commits` and `changedFiles`, inspect:
  1. every `.md`/`.mdx` changed by those commits (excluding `verifications/`),
  2. docs that link to or name any changed path, and
  3. the `README.md` or `.mdx` beside changed code.
     Reread each affected doc in full, stopping around ~15 docs per run.
- **Rotation area sweep:** Read every document in `rotationTarget` in full
  alongside linked docs and the code they describe. Bias toward **shrinking and
  pruning**:
  - content superseded by a later decision, workflow, or implementation;
  - explanations duplicated from their primary home (replace with a link);
  - descriptions of code, commands, screens, or options that no longer exist;
  - documents without a distinct reader task (merge into the owning page);
  - detail that types, config, stories, or examples already explain;
  - empty or redundant docs (propose removal + inbound link updates).
- **Guardrails:** Every proposal must cite a concrete rule in
  [documentation guide](../../docs/guides/documentation.md). Prefer removal or
  shortening over rewriting prose. When code and docs disagree and intended
  behavior is unclear, set `ambiguous: true` rather than guessing.
- **Brief verification:** Include `vp run check:docs` (plus public-doc checks in
  `interfaces/site/src/features/docs/README.md` when `interfaces/site` docs
  change).

### `tests`

Read [testing guide](../../docs/guides/testing.md) and
[verification guide](../../docs/guides/verification.md).

- **Owner-feedback mining:** Inspect recent merged PRs from `commits` for owner
  review comments asking to change, move, merge, or remove tests. Treat each
  request as a defect pattern and scan the entire slice for the same pattern.
- **Whole-slice multi-layer audit:** Map changed files (including `app/tests`
  mapping back to owning capability/interface slices) to slices
  (`capabilities/<name>`, `foundation/<name>`, `interfaces/<name>`,
  `tooling/testing`), capped around ~3 slices per run plus `rotationTarget`.
  Read all tests in the slice across all layers side-by-side and evaluate all
  seven dimensions of [testing guide](../../docs/guides/testing.md):
  1. **Owning layer:** verified at the lowest layer that can observe it?
  2. **Overlap:** repeats another layer without justification in
     [justify overlapping coverage](../../docs/guides/testing.md#justify-overlapping-coverage)?
  3. **Worth testing:** asserts business outcome/contract, not internal call
     counts, framework behavior, discarded implementations, or restated constants?
  4. **One behavior:** independent setup per behavior so rules fail independently?
  5. **Assertion strength:** would fail if the rule broke? Recommend
     [focused mutation checks](../../docs/guides/testing.md#focused-mutation-checks)
     for consequential rules.
  6. **Test data:** deciding values explicit; uses owning capability fixtures
     rather than demo records picked by position?
  7. **Cohesion:** consistent naming/fixtures; no near-duplicates differing only
     in incidental input?
- **Rotation cleanup slice:** Shrink `rotationTarget` by removing unjustified
  cross-layer duplicates, collapsing near-duplicates, dropping framework/constant
  tests, and deleting unused test helpers/fixtures — only where every guarantee
  remains covered.
- **Guardrails:** Never propose removing the only test of a guarantee, lowering
  coverage thresholds, narrowing measured scope, adding coverage-ignore
  directives, or skipping a test without `ambiguous: true` and explicit owner
  approval ([coverage policy](../../docs/guides/testing.md#coverage-policy-changes)).
  Never mix test cleanup with production code edits; file concrete production
  bugs as separate proposals.
- **Brief verification:** Include the owning package's full test command
  (`vp run @merit/<pkg>#test`) so coverage thresholds execute, plus any touched
  integration, component, or browser suites.

### `verification-flakes`

Read [verification guide](../../docs/guides/verification.md) and
[verification tooling](../../docs/guides/verification-tooling.md).

- **Inputs:** Read every file in `unreadVerifications` (`verifications/<pr>.md`),
  inspecting the PR description and review threads when context is needed. For
  recurrence counting, also inspect records removed in the last 4 weeks:
  `git log --since='4 weeks ago' --diff-filter=D --format='commit %H' --name-only -- 'verifications/*.md'`
  (read prior contents via `git show <commit>^:verifications/<pr>.md`).
- **Classify and count causes:**
  1. **Could not verify:** environment, runtime, credential, host, or unrelated
     check blockers.
  2. **Did not verify:** compare against
     [verification guide](../../docs/guides/verification.md#verification); a skip
     disallowed by policy is actionable even once.
  3. **Dismissed review findings:** reviewer, request, and dismissal reason; an
     invalid dismissal is actionable even once.
     A cause is recurring when it appears in **≥2 records** within the 4-week
     window. Leave harmless one-offs alone.
- **Fix routing:**
  - Environment blocks a check → propose updating `.agents/install-environment.sh`
    (Tier 2) or documenting the blocker cleanly.
  - Agents misjudge a documented check → tighten the owning guide.
  - CodeRabbit or Greptile repeats dismissed findings → tighten `.coderabbit.yaml`,
    `.greptile/rules.md`, or `.greptile/files.json` (preserving parity verified
    by `tooling/verification/docs.test.ts`).
  - `feature-reviewer` repeats dismissed findings → tighten
    [review.md](../skills/build-feature/review.md) (staying within its 95-line /
    4800-byte budget) or
    [mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts).
  - Unexplained CI flake or invalid dismissal → propose a focused diagnosis/fix
    issue citing the PRs and unchecked gap.
- **Never delete `verifications/*.md`:** Monthly cleanup is handled
  deterministically by `.github/workflows/prune-verifications.yml` once records
  are older than 30 days and `prNumber <= cursor.lastPrNumber`.

## Repo-wide lenses

### `architecture`

Check [architecture](../../docs/foundations/architecture.md),
[mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts),
and [rule enforcement](../../docs/guides/verification-tooling.md#rule-enforcement).
Look for boundary leaks across capabilities/interfaces/foundation, drift between
mechanism contracts/invariants and actual adapters, and recurring prose rules
that can move up the enforcement ladder into a static check, lint rule, or
architecture test.

### `simplification`

Read [coding conventions](../../docs/guides/coding-conventions.md) and
[engineering principles](../../docs/foundations/principles.md). Look for
duplicated helpers, controllers, queries, or UI wiring that can reuse an
existing shared contract, dead indirection, or oversized modules that can be
simplified without changing external behavior.

### `security`

Audit authorization and RBAC boundaries (`capabilities/access/`), tenant and
organization isolation across queries and commands, input validation at server
and API boundaries, HTML/URL/iframe hygiene, secret/config handling, and GitHub
Actions SHA pinning and least-privilege permissions.

### `mcp-db`

Audit MCP tool schemas, descriptions, permissions, and eval coverage
(`capabilities/*/ai`, `app/tests/evals/mcp`), alongside database queries,
indexes, N+1 patterns, and Drizzle schema discipline (`foundation/db/`). Never
propose modifying or deleting applied SQL migrations under
`foundation/db/database/migrations/*.sql`.

## Suggested schedule

Run **one** recurring scheduled task **twice daily** (e.g., `08:00` and `20:00`)
passing `--lens auto`. [scout.ts](../../tooling/agents/scout.ts) selects the
most overdue lens from `#219` cursors (~15 runs/week total) and exits `idle` if
every lens is still fresh:

| Lens                                   | Target interval |
| -------------------------------------- | --------------- |
| `docs`, `tests`                        | Every 2 days    |
| `verification-flakes`                  | Every 3 days    |
| `architecture`                         | Every 4 days    |
| `simplification`, `security`, `mcp-db` | Every 5 days    |

In cloud runners whose default GitHub App token lacks `issues:write` (such as
Cursor Cloud Agents), configure a fine-grained PAT scoped to `dmprav/merit` with
`Issues: Read and write` in the `MERIT_SCOUT_GH_TOKEN` secret. Both
[scout.ts](../../tooling/agents/scout.ts) and
[proposal.ts](../../tooling/agents/proposal.ts) prefer `MERIT_SCOUT_GH_TOKEN`
automatically when invoking `gh`.
