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
     `rotationAxis` (for `architecture`/`simplification`), `telemetry` (for
     `architecture`/`simplification`), `unreadVerifications`, `openIssues`, and
     `wontfixIssues` (including each maintainer rejection `reason`, when
     present).
   - A ready run reads the working tree as `origin/main`, so `scout.ts context`
     fails when the checkout is at another commit or has changed or untracked
     paths. On a clean checkout, run the `git switch --detach <scanTipSha>` the
     error names and retry. If the checkout has changes, stop and report them
     without advancing any cursor rather than stashing or discarding them.
2. **Respect the proposal cap:**
   While running in human-gated mode (`--tier2-only`), every proposal lands in
   `agent:proposed` (capped at 5 open issues). Leaving the cursor untouched on
   `cap_reached` ensures findings wait until the maintainer triages open
   proposals.
3. **Inspect the codebase using the emitted `lens` rules below:**
   - Do not repeat work already covered by `openIssues` or rejected in
     `wontfixIssues` (read `wontfixIssues[].reason` to honor maintainer taste).
   - Respect `trackedBy` on `telemetry` hotspots and clone groups: skip files
     already tracked by an open or `wontfix` issue unless you have a clearly
     distinct root cause.
   - **Worth-a-PR bar:** Every proposal goes through human triage, a full
     implementation + review cycle, and a full CI run. **Do not file
     micro-proposals** (a 1–2 line wording tweak, a single missing test
     assertion, or an isolated style nit).
   - **Bundle within the audited scope:** When a sweep uncovers multiple
     concrete issues of the same lens (e.g., several doc/tool-description
     mismatches in one area, or duplicate tests + missing assertions across one
     slice), bundle them into **one cohesive proposal** worth a real PR. If a
     sweep only turns up 1–2 trivial nits, **file zero proposals** and advance
     the cursor.
   - **Bounded reading budget:** On horizontal lenses (`architecture`,
     `simplification`), read `rotationAxis.anchorDocs` plus 3–5 axis-matched
     `telemetry` hotspots/clones or 2–3 contrasting sibling implementations in
     full — never skim an entire layer superficially.
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

   Choose the proposal `kind` deliberately (`proposalInputSchema` in
   [proposal.ts](../../tooling/agents/proposal.ts)):
   - **`"kind": "pr"` (default):** Single-PR changes, including PR 1 of a
     clearly settled multi-PR refactor (listing PR 2..N in `brief.outOfScope`).
     Must include a self-contained `brief` (`behavior`, `outOfScope`,
     `precedents`, `plan`, `verification`) so
     [implement-proposal](../skills/implement-proposal/SKILL.md) can execute
     without interactive grilling.
   - **`"kind": "design"`:** Systemic architectural findings that require a
     maintainer design decision or multi-PR sequencing too large for one PR.
     `proposal.ts` automatically attaches `agent:design` (preventing Queue
     Worker auto-dispatch) and renders bounded `design` fields (`options` 2–3,
     `recommendation`, `prSequence` 2–4 ordered PRs where PR 1 ships standalone,
     `openQuestions` 1–4). Never write essays — keep every field a crisp single
     line.

   Every JSON payload must also include:
   - **Review summary (compact for human scanning):** `why` (≤220 chars),
     `evidence` (≤200 chars, ≥2 concrete `file:line` citations or exact
     telemetry metrics), `change` (1–5 single-line bullets ≤140 chars),
     `decision` (≤200 chars, why this approach), `whyNot` (≤200 chars, main
     alternative rejected).
   - **Scope & flags:** explicit `paths` (avoid globs unless truly multi-file),
     `ambiguous: true` whenever intended behavior, policy, or trade-offs are
     unsettled. Never pass `agent:*` labels in `extraLabels`.

5. **Advance the lens cursor:**
   Only after finishing inspection — and **not** if `scout.ts context` returned
   `status: "idle"` / `status: "cap_reached"` or `proposal.ts` returned
   `status: "cap_reached"` for an unfiled finding — run with the **explicit**
   emitted `lens` (never `--lens auto`) and `--target <rotationTarget>` (when
   `rotationTarget` is non-null):
   `vpx tooling/agents/scout.ts advance --lens <lens> --commit <scanTipSha> --target <rotationTarget>`
   For `verification-flakes`, omit `--target` and pass
   `--pr <highestUnreadPrNumber>` when `unreadVerifications` was non-empty.

## Lens audit protocols

### `architecture`

Read [architecture](../../docs/foundations/architecture.md),
[mechanisms.config.ts](../../tooling/verification/architecture/mechanisms.config.ts),
and [rule enforcement](../../docs/guides/verification-tooling.md#rule-enforcement).

- **Horizontal axis scope:** `scout.ts context` rotates round-robin across six
  Merit-specific horizontal axes (`rotationAxis.id`, `anchorDocs`,
  `pathPatterns`, `focus`):
  1. `capability-ownership-and-boundaries`
  2. `web-layering-and-draft-recovery`
  3. `interface-transport-and-routing`
  4. `shared-ui-and-design-system-contracts`
  5. `audit-demo-and-observability-mechanisms`
  6. `enforcement-ladder-and-verification-gaps`
- **Telemetry-guided reading:** Start from `rotationAxis.anchorDocs`,
  `telemetry.topFiles`, `telemetry.cloneGroups`, `telemetry.thresholdOverrides`,
  `telemetry.entryWeights` (on `interface-transport-and-routing`),
  `telemetry.suppressions`, and `telemetry.capabilitySymmetry`, plus any
  `changedFiles` matching `matchedMechanisms`.
- **Handoff boundaries:** `architecture` owns cross-capability boundaries,
  ownership, mechanism invariants, route/bundle architecture, and
  enforcement-ladder rules. Leave auth/RBAC/tenant/secret bugs to `security`,
  MCP tool contracts/SQL indexes/command transactions to `mcp-db`, and
  boundary-preserving clone/complexity deletion to `simplification`.
- **Guardrail:** Honor
  [design boundaries around behavior](../../docs/foundations/architecture.md#design-boundaries-around-behavior)
  — _"Neither implementation size nor the number of layers establishes its
  quality."_ Never propose splitting a file purely because of LOC or density
  metrics; every proposal must fix a real coupling, ownership, bundle,
  invariant, or enforcement problem. Use `"kind": "design"` when the fix spans
  multiple PRs or requires a maintainer architecture choice.

### `simplification`

Read [coding conventions](../../docs/guides/coding-conventions.md) and
[engineering principles](../../docs/foundations/principles.md).

- **Coarse layer scope:** `scout.ts context` rotates round-robin across four
  layers (`business-server`, `web-views-and-controllers`,
  `interfaces-and-routes`, `foundation-and-tooling`) anchored to
  `telemetry.cloneGroups` and `telemetry.topFiles`.
- **What to hunt for (high leverage):**
  1. **Cross-file production clones:** Duplicated services, queries,
     controllers, route shells, or UI/form/table wiring highlighted by
     `telemetry.cloneGroups` that can collapse onto an existing shared contract.
  2. **Dead indirection:** Pass-through wrappers, single-caller abstractions,
     or redundant adapter glue that add cognitive load without protecting a real
     boundary.
  3. **Tangled modules:** Oversized modules mixing unrelated responsibilities
     that can be simplified cleanly without changing capability boundaries or
     external behavior.
- **Guardrail:** Never propose speculative rewrites, stylistic churn, or pure
  LOC-driven splitting. Every simplification must measurably delete complexity
  or duplicate code while preserving exact external behavior; hand boundary
  redesigns to `architecture`.

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
  - empty or redundant docs (propose removal + inbound link updates);
  - user-POV feature map drift in [drive-merit/features](../skills/drive-merit/SKILL.md#feature-maps-user-pov)
    when new routes, workflows, or primary ARIA handles change.
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
still fresh. Each lens declares its interval, priority, rotation, telemetry, and
verification reading in `LENS_POLICIES` in
[lenses.ts](../../tooling/agents/scout/lenses.ts):

| Lens                             | Target interval |
| -------------------------------- | --------------- |
| `architecture`, `simplification` | Every 2 days    |
| `security`, `mcp-db`, `tests`    | Every 3 days    |
| `docs`                           | Every 4 days    |
| `verification-flakes`            | Every 5 days    |

Both [scout.ts](../../tooling/agents/scout.ts) and
[proposal.ts](../../tooling/agents/proposal.ts) read and file issues only
through GitHub REST (`gh api`), using the issue client in
[github.ts](../../tooling/agents/github.ts), so they run cleanly in Claude Code
Cloud sessions using the built-in GitHub proxy with no custom secret. In cloud
runners whose default GitHub App token lacks `issues:write` (such as Cursor
Cloud Agents), configure a fine-grained PAT scoped to `dmprav/merit` with
`Issues: Read and write` in the `MERIT_SCOUT_GH_TOKEN` secret — when it is set,
the issue client passes it to `gh` as `GH_TOKEN`; otherwise `gh` keeps the
runner's own credentials. Create the token from an account with push access to
the repository: GitHub silently drops the labels of a new issue filed without
it. When `proposal.ts` reports that an issue was created without its labels,
apply the missing labels to that issue instead of filing the proposal again.
