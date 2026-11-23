---
name: implement-proposal
description: Implement an approved `agent:ready` Merit proposal issue without interactive grilling. Validates readiness and protected-path approval, delegates implementation to `feature-builder` (Sonnet) and independent review to `feature-reviewer` (Opus) for up to two rounds, opens a draft pull request with a verification record, and marks it ready. Use when implementing a maintainer-approved or Tier 1 `agent:ready` issue from the autonomous maintenance queue.
---

# Implement a proposal

Execute an approved `agent:ready` GitHub issue brief end-to-end without interactive
grilling. Follow [AGENTS.md](../../../AGENTS.md),
[build-feature](../build-feature/SKILL.md), and [review.md](../build-feature/review.md).

Never guess past an unsettled product, architecture, or coverage-policy decision.
When anything blocks autonomous execution, stop, add `agent:needs-human`, explain
the exact blocker on the issue, and exit without opening a pull request.

## 1. Validate the proposal

1. Read the target issue with `gh issue view <issue-number> --json number,state,title,body,labels,comments`.
2. Confirm the issue is `OPEN`, carries `agent:ready`, and does **not** carry
   `agent:needs-human`, `agent:proposed`, or `wontfix`.
3. Parse the `<!-- merit-proposal: {...} -->` marker and the `<details>`
   **Implementer brief** (`Behavior`, `Out of scope`, `Precedents`, `Plan`,
   `Verification`). Confirm the brief is complete and unambiguous.
4. Check whether any planned file touches a protected path enforced by
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
   - If required approval is missing, escalate to `agent:needs-human` and stop.

## 2. Prepare a clean branch

Start from latest `origin/main` on a clean branch (use the cloud session's
assigned `claude/*` branch if provided, otherwise `claude/issue-<issue-number>`).
Never reuse a dirty worktree or an unrelated branch.

## 3. Delegate the build

Start the [feature-builder](../../../.claude/agents/feature-builder.md) subagent
with **only**:

- the issue's **Implementer brief** (plus its `paths` scope and issue number),
- the base branch (`origin/main`), and
- an external screenshot directory outside the repository when the change touches UI.

If implementation approaches 90 minutes before a draft pull request exists,
renew issue ownership with
`vpx tooling/agents/queue.ts claim <issue-number> --renew <runId>` so the 2-hour
claim stays active until the draft PR is opened.

If the builder stops with an unresolved ambiguity, an unplanned departure, or a
request that requires lowering coverage thresholds or skipping a test
([coverage policy](../../../docs/guides/testing.md#coverage-policy-changes)):

1. Add `agent:needs-human` to the issue (`gh issue edit <n> --add-label agent:needs-human`).
2. Post a concise comment stating the exact question and the concrete options.
3. Exit cleanly without committing or opening a pull request.

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
**only** the brief, `origin/main`, and (for UI) its own screenshot directory. Do
not pass the builder's report, reasoning, or screenshots.

Triage every finding:

- **Fix** by default in a fresh builder/fix round.
- **Reject** only with a concrete citation from the brief, a guide, or a
  precedent (`"Minor"` or `"out of scope"` is not valid). Record every rejected
  finding for `verifications/<pr-number>.md`.
- **Escalate** (`agent:needs-human` on the issue, stop without opening a PR) if a
  finding shows the agreed behavior or policy is broken.

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

## 5. Open draft PR, add verification record, and mark ready

1. Commit with
   [commit conventions](../../../docs/guides/development.md#commit-changes) and
   push the branch.
2. Open a **draft** pull request labeled `agent:pr` using the
   [pull request template](../../../.github/pull_request_template.md):
   - `gh pr create --draft --label agent:pr --title "<type>(<scope>): <summary>" ...`
   - **Why:** 1–2 sentences on the outcome and `Closes #<issue-number>` (required
     by [agent-policy.ts](../../../tooling/verification/agent-policy.ts) and
     [queue.ts](../../../tooling/agents/queue.ts)).
   - **What changed:** 3–6 concise bullets covering resulting behavior and named
     precedents. Delete HTML template comments; do not paste logs or file lists.
   - **Follow-ups:** include only concrete remaining items; omit when empty.
3. Add `verifications/<pr-number>.md` on the branch following
   [record verification](../../../docs/guides/verification.md#record-verification)
   with all four required H2 headings (`Checks run`, `Could not verify`,
   `Did not verify`, `Dismissed review findings`). Commit and push.
4. Initialize autonomous PR state:
   `vpx tooling/agents/queue.ts record-shepherd <pr-number> --round 0 --sha $(git rev-parse HEAD) --issue <issue-number>`.
5. Mark the pull request ready (`gh pr ready <pr-number>`). If an error
   interrupts steps 3–5 after creating the draft PR, add `agent:needs-human` and
   comment with the failure on the draft PR before exiting (any stranded draft
   left unready for more than 2 hours is also automatically escalated by
   [queue.ts](../../../tooling/agents/queue.ts)).
6. Exit cleanly. Automated review (CodeRabbit and Greptile) and CI follow-up are
   handled in subsequent runs by [queue-worker.md](../../../.agents/tasks/queue-worker.md).
