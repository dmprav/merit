---
name: implement-proposal
description: Implement an approved `agent:ready` Merit proposal issue without interactive grilling. Validates readiness and protected-path approval, delegates implementation to `feature-builder` (Sonnet) and independent review to `feature-reviewer` (Opus) for up to two rounds, opens an `agent:pr` pull request via REST, commits its verification record, and initializes shepherd state. Use when implementing a maintainer-approved or Tier 1 `agent:ready` issue from the autonomous maintenance queue.
---

# Implement a proposal

Execute an approved `agent:ready` GitHub issue brief end-to-end without interactive
grilling. Follow [AGENTS.md](../../../AGENTS.md),
[build-feature](../build-feature/SKILL.md), and [review.md](../build-feature/review.md).

Use `vpx tooling/agents/queue.ts` (GitHub REST API) for all GitHub issue and PR
operations — **never** call `gh issue`, `gh pr`, or `gh api graphql`, because
Claude Code cloud sessions block GitHub GraphQL with HTTP 403.

Never guess past an unsettled product, architecture, or coverage-policy decision.
When anything blocks autonomous execution, stop, escalate via
`vpx tooling/agents/queue.ts escalate <issue-number> --reason "<blocker>"`, and
exit without opening a pull request.

## 1. Validate the proposal

1. Read the target issue with `vpx tooling/agents/queue.ts issue <issue-number>`.
2. Confirm the issue is `OPEN`, carries `agent:ready`, and does **not** carry
   `agent:needs-human`, `agent:proposed`, `agent:design`, or `wontfix`.
3. Parse the `<!-- merit-proposal: {...} -->` marker and the `<details>`
   **Implementer brief** (`Behavior`, `Out of scope`, `Precedents`, `Plan`,
   `Verification`). Confirm the marker does **not** have `"kind": "design"` and
   that a complete, unambiguous single-PR **Implementer brief** is present; if
   not, call
   `vpx tooling/agents/queue.ts escalate <issue-number> --reason "Issue is a design proposal or lacks a single-PR implementer brief."`
   and exit without coding.
4. Read any comments authored by trusted maintainers (`authorAssociation` in
   `OWNER`, `MEMBER`, or `COLLABORATOR`), ignoring automated claim and
   protected-path markers. Treat clear maintainer steering comments as
   **authoritative overrides** on top of the Implementer brief; if a comment
   leaves scope or behavior ambiguous, escalate via `queue.ts escalate` and exit
   without coding.
5. Check whether any planned file touches a protected path enforced by
   [agent-policy.ts](../../../tooling/verification/agent-policy.ts) (`.github/`,
   `.agents/hooks/`, `.claude/`, `tooling/agents/`, `tooling/verification/`,
   `foundation/db/database/migrations/`, `capabilities/access/src/`,
   `.fallowrc.jsonc`, `vite.config.ts`):
   - Applied SQL migrations under `foundation/db/database/migrations/*.sql` can
     never be modified or deleted by an autonomous PR.
   - Any other protected path requires **both** the `agent:allow-protected` label
     on the open `agent:ready` issue **and** the **latest** comment authored by
     a trusted maintainer (`authorAssociation` in `OWNER`, `MEMBER`, or
     `COLLABORATOR`) containing `<!-- merit-approve-protected: {"paths":[...]} -->`
     with narrow patterns (no catch-all or first-segment wildcards) covering
     every touched protected path (`agent-policy.ts` evaluates only the latest
     trusted approval).
   - If required approval is missing, escalate via
     `vpx tooling/agents/queue.ts escalate <issue-number> --reason "<missing approval>"`
     and stop.

## 2. Prepare a clean branch

Start from latest `origin/main` on a clean branch (use the cloud session's
assigned `claude/*` branch if provided, otherwise `claude/issue-<issue-number>`).
Never reuse a dirty worktree or an unrelated branch.

## 3. Delegate the build

Start the [feature-builder](../../../.claude/agents/feature-builder.md) subagent
with **only**:

- the issue's **Implementer brief** (plus any trusted maintainer steering
  overrides from step 1.4, its `paths` scope, and issue number),
- the base branch (`origin/main`), and
- an external screenshot directory outside the repository when the change touches UI.

If implementation approaches 90 minutes before the pull request exists, renew
issue ownership with
`vpx tooling/agents/queue.ts claim <issue-number> --renew <runId>` so the 2-hour
claim stays active until the PR is opened.

If the builder stops with an unresolved ambiguity, an unplanned departure, or a
request that requires lowering coverage thresholds or skipping a test
([coverage policy](../../../docs/guides/testing.md#coverage-policy-changes)):

1. Escalate via
   `vpx tooling/agents/queue.ts escalate <issue-number> --reason "<exact question and options>"`.
2. Exit cleanly without committing or opening a pull request.

When the builder finishes, verify before review:

- `git diff --stat origin/main...HEAD` stays within the brief's **Plan** and
  approved `paths` (plus the verification record added in step 5).
- Every command in the brief's **Verification** passes (including full package
  test commands so coverage thresholds execute).
- For UI changes, inspect screenshots beside the named precedent per
  [UI verification](../../../docs/guides/ui-verification.md#verification).

## 4. Review independently

Start a fresh, read-only
[feature-reviewer](../../../.claude/agents/feature-reviewer.md) subagent with
**only** the brief (plus any trusted maintainer steering overrides from step
1.4), `origin/main`, and (for UI) its own screenshot directory. Do not pass the
builder's report, reasoning, or screenshots.

Triage every finding:

- **Fix** by default in a fresh builder/fix round.
- **Reject** only with a concrete citation from the brief, a guide, or a
  precedent (`"Minor"` or `"out of scope"` is not valid). Record every rejected
  finding for `verifications/<pr-number>.md`.
- **Escalate** (`vpx tooling/agents/queue.ts escalate <issue-number> --reason "..."`
  and stop without opening a PR) if a finding shows the agreed behavior or
  policy is broken.

Require coverage evidence from the reviewer (precedents read, `mechanisms.ts`
output checked, screenshot pairs compared when UI changed, and each rubric
section in [review.md](../build-feature/review.md) checked) and confirm
`git status --porcelain` is unchanged after review. After fixes beyond a few
lines, run one more fresh reviewer round. **Stop after two rounds**; carry any
non-blocking follow-up to the PR's **Follow-ups** section, or escalate if
blocking.

If subagents are unavailable in the current environment, reread the full diff
from disk against [review.md](../build-feature/review.md) and note explicitly in
the PR description and verification record that the review was not independent.

## 5. Open PR, add verification record, and initialize state

1. Commit with
   [commit conventions](../../../docs/guides/development.md#commit-changes) and
   push the branch.
2. Write the PR description to a temp file (e.g., `/tmp/pr-body.md`) using the
   [pull request template](../../../.github/pull_request_template.md):
   - **Why:** 1–2 sentences on the outcome and `Closes #<issue-number>` (required
     by [agent-policy.ts](../../../tooling/verification/agent-policy.ts) and
     [queue.ts](../../../tooling/agents/queue.ts)).
   - **What changed:** 3–6 concise bullets covering resulting behavior and named
     precedents. Delete HTML template comments; do not paste logs or file lists.
   - **Follow-ups:** include only concrete remaining items; omit when empty.
3. Open the pull request via REST (non-draft, because GitHub's
   `markPullRequestReadyForReview` is GraphQL-only and blocked in Claude Code
   cloud sessions; pushing the verification record in the next step cancels the
   pre-record CI run via `verify.yml`'s `cancel-in-progress: true`):
   `vpx tooling/agents/queue.ts open-pr --title "<type>(<scope>): <summary>" --head "$(git branch --show-current)" --body-file /tmp/pr-body.md`
   Record the returned `number`.
4. Immediately add `verifications/<pr-number>.md` on the branch following
   [record verification](../../../docs/guides/verification.md#record-verification)
   with all four required H2 headings (`Checks run`, `Could not verify`,
   `Did not verify`, `Dismissed review findings`). Commit and push.
5. Initialize autonomous PR state if not already set (until this marker is
   recorded, [queue.ts](../../../tooling/agents/queue.ts) holds the PR out of
   shepherd selection for up to 2 hours from creation so concurrent runs cannot
   race the builder; `--if-uninitialized` preserves existing shepherd rounds if
   `open-pr` reused an already-initialized PR):
   `vpx tooling/agents/queue.ts record-shepherd <pr-number> --round 0 --sha $(git rev-parse HEAD) --issue <issue-number> --if-uninitialized`.
   If an error interrupts steps 4–5 after opening the PR, call
   `vpx tooling/agents/queue.ts escalate <pr-number> --reason "<failure>"`
   before exiting (any uninitialized PR left stranded for more than 2 hours is
   also automatically escalated by `queue.ts`).
6. Exit cleanly. Automated review (CodeRabbit and Greptile) and CI follow-up are
   handled in subsequent runs by [queue-worker.md](../../../.agents/tasks/queue-worker.md).
