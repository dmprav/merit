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
   - **Worth-a-PR bar:** Every proposal goes through human triage, a full
     implementation + review cycle, and a full CI run. **Do not file
     micro-proposals** (a 1–2 line wording tweak, a single missing test
     assertion, or an isolated style nit).
   - **Bundle within the audited slice:** When a slice sweep uncovers multiple
     concrete issues of the same lens (e.g., several doc/tool-description
     mismatches in one capability, or duplicate tests + missing assertions
     across one package), bundle them into **one cohesive slice-level
     proposal** worth a real PR. If a sweep only turns up 1–2 trivial nits,
     **file zero proposals** and advance the cursor.
   - File at most **2 high-signal proposals per run**. Prefer zero proposals
     over low-leverage churn.
   - Read every target file and its named precedent in full before proposing a
     change.
4. **Emit proposals through `proposal.ts`:**
   Pipe one JSON object per finding into:
   `vpx tooling/agents/proposal.ts --tier2-only`

   > **Human-gated proposals:** Keep `--tier2-only` enabled so every
   > substantive proposal lands in `agent:proposed` for maintainer triage before
   > implementation.

   Every JSON payload must satisfy `proposalInputSchema` in
   [proposal.ts](../../tooling/agents/proposal.ts):
   - **Review summary (compact for human scanning):** `why` (≤220 chars),
     `evidence` (≤200 chars, file paths + lines or PR numbers), `change` (1–5
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

## Lens audit protocols

### `architecture`

Read [architecture](../../docs/foundations/architecture.md),
[mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts),
and [rule enforcement](../../docs/guides/verification-tooling.md#rule-enforcement).

- **Scope:** Audit `rotationTarget` alongside at least one sibling slice
  (`capabilities/*`, `foundation/*`, `interfaces/*`), plus any `changedFiles`
  matching cross-cutting mechanisms (`matchedMechanisms`).
- **What to hunt for (high leverage):**
  1. **Boundary leaks:** Capabilities reaching across internal modules, UI
     owning domain rules, or adapters bypassing shared contracts.
  2. **Mechanism drift:** Implementations diverging from a contract or
     invariant in `mechanisms.config.ts` (auth/RBAC, money, audit trail,
     delegated MCP, query/mutation boundaries, etc.).
  3. **Escalating prose rules up the enforcement ladder:** Recurring rules in
     `AGENTS.md`, `review.md`, or guides that can be enforced automatically via
     a static check, lint rule, TypeScript boundary test, or architecture test.
  4. **Missing shared contracts:** The same non-trivial pattern implemented
     independently across ≥2 sibling capabilities that should move into a
     single shared contract.

### `simplification`

Read [coding conventions](../../docs/guides/coding-conventions.md) and
[engineering principles](../../docs/foundations/principles.md).

- **Scope:** Audit `rotationTarget` end-to-end (business, web, AI/MCP) alongside
  its closest sibling slice and any recently touched modules in `changedFiles`.
- **What to hunt for (high leverage):**
  1. **Duplicated slice logic:** Repeated services, repositories, validation
     pipelines, React hooks/controllers, or table/form wiring that can reuse an
     existing shared `foundation/*` or sibling abstraction.
  2. **Dead indirection:** Pass-through wrappers, single-caller abstractions,
     or over-fragmented files that add cognitive load without protecting a real
     boundary.
  3. **Oversized or tangled modules:** Large files or functions mixing domain
     rules, persistence, and presentation that can be simplified cleanly
     without changing external behavior.
  4. **Guardrail:** Never propose speculative rewrites or stylistic churn;
     every simplification must measurably delete complexity or duplicate code
     while preserving exact external behavior.

### `security`

Audit `rotationTarget` and recent `changedFiles` end-to-end across web, server,
MCP, and database boundaries.

- **What to hunt for (high leverage):**
  1. **Authorization & RBAC gaps:** Missing or inconsistent permission checks
     (`capabilities/access/`) across server actions, loaders, API routes, and
     MCP tools — including IDOR / horizontal privilege escalation.
  2. **Tenant & organization isolation:** Queries, mutations, file-storage
     keys, or cache entries that fail to scope strictly by organization/tenant
     or allow cross-tenant references via caller-supplied IDs.
  3. **Boundary validation & injection hygiene:** Weak or unvalidated external
     inputs, unsafe HTML/URL/iframe/redirect handling, error messages leaking
     internal state/secrets, or missing rate/size bounds.
  4. **Supply-chain & CI hygiene:** Unpinned GitHub Actions, overly broad
     workflow permissions, or unsafe secret handling.

### `mcp-db`

Audit `rotationTarget` and recent `changedFiles` across MCP tools
(`capabilities/*/ai`, `interfaces/mcp`, `app/tests/evals/mcp`) and database
layers (`foundation/db/`, capability repositories).

- **What to hunt for (high leverage):**
  1. **MCP contract & eval gaps:** Missing or weak MCP evals for real tool
     behaviors, schema/permission mismatches between MCP tools and domain
     services, or tool contracts that make agents misuse mutations.
  2. **Query & index performance:** N+1 query loops, unbounded `SELECT`s on
     growing tables, or hot filter/join columns missing Drizzle indexes.
  3. **Write integrity:** Multi-step mutations missing transactions,
     optimistic-concurrency/revision checks, or idempotency guards.
  4. **Guardrail:** Never propose modifying or deleting applied SQL migrations
     under `foundation/db/database/migrations/*.sql`.

### `tests`

Read [testing guide](../../docs/guides/testing.md) and
[verification guide](../../docs/guides/verification.md).

- **Owner-feedback mining:** Inspect recent merged PRs from `commits` for owner
  review comments asking to change, move, merge, or remove tests. Treat each
  request as a defect pattern and scan the entire slice for the same pattern.
- **Whole-slice multi-layer audit:** Audit `rotationTarget` plus up to ~2
  recently changed slices (mapping `app/tests` back to their owning slice)
  across all layers side-by-side against all seven dimensions of
  [testing guide](../../docs/guides/testing.md):
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
- **Bundle slice-wide improvements:** Combine all concrete test cleanup and
  consequential coverage gaps found in the audited slice into **one cohesive
  slice-level proposal**. Do not file a standalone issue for a single missing
  assertion unless it guards a critical security or money/data-loss invariant.
- **Guardrails:** Never propose removing the only test of a guarantee, lowering
  coverage thresholds, narrowing measured scope, adding coverage-ignore
  directives, or skipping a test without `ambiguous: true` and explicit owner
  approval ([coverage policy](../../docs/guides/testing.md#coverage-policy-changes)).
  Never mix test cleanup with production code edits; file concrete production
  bugs as separate proposals.
- **Brief verification:** Include the owning package's full test command
  (`vp run @merit/<pkg>#test`) so coverage thresholds execute, plus any touched
  integration, component, or browser suites.

### `docs`

Read [documentation guide](../../docs/guides/documentation.md) and
[docs/README.md](../../docs/README.md).

- **Recent-merge impact & rotation area sweep:** Inspect docs affected by
  recent `commits` plus every document in `rotationTarget` in full alongside
  linked docs and the code they describe. Bias toward **shrinking, pruning, and
  fixing real behavioral contradictions**:
  - content superseded by a later decision, workflow, or implementation;
  - explanations duplicated from their primary home (replace with a link);
  - descriptions of code, commands, screens, or options that no longer exist;
  - documents without a distinct reader task (merge into the owning page);
  - detail that types, config, stories, or examples already explain;
  - empty or redundant docs (propose removal + inbound link updates).
- **Bundle slice-wide cleanups:** Bundle all concrete doc drift, duplication,
  and pruning in the audited area into **one cohesive proposal**. Skip if only
  a 1–2 line wording tweak was found unless it actively misleads callers into
  bugs.
- **Guardrails:** Every proposal must cite a concrete rule in
  [documentation guide](../../docs/guides/documentation.md). Prefer removal or
  shortening over rewriting prose. When code and docs disagree and intended
  behavior is unclear, set `ambiguous: true` rather than guessing.
- **Brief verification:** Include `vp run check:docs` (plus public-doc checks in
  `interfaces/site/src/features/docs/README.md` when `interfaces/site` docs
  change).

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

## Suggested schedule

Run **one** recurring scheduled task **2–3 times daily** passing `--lens auto`
with a strong reasoning model. [scout.ts](../../tooling/agents/scout.ts)
prioritizes high-leverage engineering lenses and selects the most overdue lens
from `#219` cursors (~17 runs/week total), exiting `idle` if every lens is
still fresh:

| Lens                             | Target interval |
| -------------------------------- | --------------- |
| `architecture`, `simplification` | Every 2 days    |
| `security`, `mcp-db`, `tests`    | Every 3 days    |
| `docs`                           | Every 4 days    |
| `verification-flakes`            | Every 5 days    |

In cloud runners whose default GitHub App token lacks `issues:write` (such as
Cursor Cloud Agents), configure a fine-grained PAT scoped to `dmprav/merit` with
`Issues: Read and write` in the `MERIT_SCOUT_GH_TOKEN` secret. Both
[scout.ts](../../tooling/agents/scout.ts) and
[proposal.ts](../../tooling/agents/proposal.ts) prefer `MERIT_SCOUT_GH_TOKEN`
automatically when invoking `gh`.
