# Autonomous Queue Worker

Scheduled execution worker for Merit's autonomous maintenance queue. Designed
for hosted Claude Code cloud runs with a **strict one-unit-of-work-per-run**
budget so every PR shepherd round or new proposal implementation starts in a
fresh context.

All GitHub operations use `vpx tooling/agents/queue.ts` (GitHub REST API) and
REST `gh run` commands — **never** call `gh pr`, `gh issue`, `gh repo`, or
`gh api graphql`, because Claude Code cloud sessions reject GitHub GraphQL with
HTTP 403.

Start with [AGENTS.md](../../AGENTS.md) and
[implement-proposal](../skills/implement-proposal/SKILL.md).

## 1. Select the next work order

Run:

```bash
vpx tooling/agents/queue.ts next --apply
```

Parse the JSON `QueueWorkOrder` returned on stdout. `queue.ts` enforces
priority order (open `agent:pr` PRs before new `agent:ready` issues), the WIP
cap (`MAX_OPEN_AGENT_PRS = 2`), single browser-only flake reruns, stale draft
escalation, and escalation after `MAX_SHEPHERD_ROUNDS = 2`.

Never chain multiple work orders in one session. Handle **only** the single
returned order, then exit.

## 2. Execute the work order

### `idle`

No actionable work (`no_work`, `waiting_for_checks`, or `wip_limit_reached`).
Report the `reason` and `openAgentPrCount`, then exit cleanly.

### `rerun_flake`

`queue.ts next --apply` already triggered a REST rerun of failed jobs for
`order.runId` and recorded the incremented `flakeReruns` counter on the PR.
Report the PR and run ID, then exit cleanly.

### `escalate`

`queue.ts next --apply` already added `agent:needs-human` and posted the
escalation reason on the PR. Report the PR number and reason, then exit cleanly.

### `shepherd`

Finish an open `agent:pr` pull request that has failing CI checks or unaddressed
review threads (`order.prNumber`, `order.headRefName`, `order.nextRound`).

1. **Check out the PR branch:**
   Fetch and check out `order.headRefName`. If the cloud environment cannot push
   to that existing branch, do **not** open a duplicate PR — escalate via
   `vpx tooling/agents/queue.ts escalate <prNumber> --reason "<push error>"`
   and exit.
2. **Gather full context:**
   - Read the linked issue brief (`order.issueNumber`) if present via
     `vpx tooling/agents/queue.ts issue <order.issueNumber>`.
   - Inspect `order.failedChecks` via REST Actions commands:
     `gh run list --commit <order.headSha> --workflow verify.yml` and
     `gh run view <runId> --log-failed`.
   - Refresh unaddressed review threads via
     `vpx tooling/agents/queue.ts threads <prNumber>`.
   - Read every changed file in full before editing.
3. **Triage checks and review threads:**
   - **Fix** valid CI failures, lint/type/test errors, and valid CodeRabbit,
     Greptile, or maintainer review comments.
   - **Reject** a review comment only with a concrete citation from the issue
     brief, a Merit guide, or a named precedent, and add the dismissal to
     `verifications/<prNumber>.md` under `## Dismissed review findings`.
   - **Escalate** immediately via
     `vpx tooling/agents/queue.ts escalate <prNumber> --reason "<reason>"`
     and exit if resolving the failure requires changing agreed behavior,
     touching an unapproved protected path
     ([agent-policy.ts](../../tooling/verification/agent-policy.ts)), or
     weakening tests/coverage
     ([coverage policy](../../docs/guides/testing.md#coverage-policy-changes)).
4. **Verify, update record, and push:**
   - Run the smallest covering checks per
     [verification guide](../../docs/guides/verification.md).
   - Update `verifications/<prNumber>.md` (`Checks run` and
     `Dismissed review findings`).
   - Commit following
     [commit conventions](../../docs/guides/development.md#commit-changes) and
     push to `order.headRefName`.
5. **Reply to threads and record shepherd state:**
   - For each addressed or answered thread `id` from `queue.ts threads`, run:
     `vpx tooling/agents/queue.ts reply-thread <prNumber> <threadId> --body "<concise fix or guide citation>"`
     (stamps `<!-- merit-addressed -->` via REST so subsequent runs know the
     thread was answered).
   - Record the completed round:
     `vpx tooling/agents/queue.ts record-shepherd <prNumber> --round <order.nextRound> --sha $(git rev-parse HEAD)`
     (include `--issue <order.issueNumber>` when `order.issueNumber` is set).
6. Exit cleanly so CI and automated reviewers run on the updated commit.

### `implement`

Start a new `agent:ready` issue (`order.issueNumber`) while under the WIP limit.

1. **Claim and verify ownership first:**
   Run `vpx tooling/agents/queue.ts claim <order.issueNumber>`. `queue.ts claim`
   posts a 2-hour `<!-- merit-claim: ... -->` marker via REST and re-reads the
   issue comments to verify its `runId` is the earliest active trusted claim.
   Proceed **only** when the JSON output has `"status": "claimed"` (if
   `"status"` is `"already_claimed"` or `"lost_race"`, exit cleanly without
   implementing). Save `claim.runId`.
2. **Execute the implementation skill (renewing if long-running):**
   Follow [implement-proposal](../skills/implement-proposal/SKILL.md)
   end-to-end for `#<order.issueNumber>`. If work approaches 90 minutes before
   the PR is opened, renew ownership via
   `vpx tooling/agents/queue.ts claim <order.issueNumber> --renew <runId>` and
   confirm `"status": "renewed"`. Once the PR referencing
   `Closes #<order.issueNumber>` exists, `queue.ts` tracks ownership through the
   open PR link.
3. Exit cleanly once the pull request and its verification record are pushed
   (or the issue is escalated to `agent:needs-human`).
