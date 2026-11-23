# Autonomous Queue Worker

Scheduled execution worker for Merit's autonomous maintenance queue. Designed
for hosted Claude Code cloud runs with a **strict one-unit-of-work-per-run**
budget so every PR shepherd round or new proposal implementation starts in a
fresh context.

Start with [AGENTS.md](../../AGENTS.md) and
[implement-proposal](../skills/implement-proposal/SKILL.md).

## 1. Select the next work order

Run:

```bash
vpx tooling/agents/queue.ts next --apply
```

Parse the JSON `QueueWorkOrder` returned on stdout. `queue.ts` enforces
priority order (open `agent:pr` PRs before new `agent:ready` issues), the WIP
cap (`MAX_OPEN_AGENT_PRS = 2`), single browser-only flake reruns, and escalation
after `MAX_SHEPHERD_ROUNDS = 2`.

Never chain multiple work orders in one session. Handle **only** the single
returned order, then exit.

## 2. Execute the work order

### `idle`

No actionable work (`no_work`, `waiting_for_checks`, or `wip_limit_reached`).
Report the `reason` and `openAgentPrCount`, then exit cleanly.

### `rerun_flake`

`queue.ts next --apply` already triggered `gh run rerun <runId> --failed` and
recorded the incremented `flakeReruns` counter on the PR. Report the PR and run
ID, then exit cleanly.

### `escalate`

`queue.ts next --apply` already added `agent:needs-human` and posted the
escalation reason on the PR. Report the PR number and reason, then exit cleanly.

### `shepherd`

Finish an open `agent:pr` pull request that has failing CI checks or unresolved
review threads (`order.prNumber`, `order.headRefName`, `order.nextRound`).

1. **Check out the PR branch:**
   Fetch and check out `order.headRefName`. If the cloud environment cannot push
   to that existing branch, do **not** open a duplicate PR — comment on
   `#<prNumber>` with the push error, add `agent:needs-human`, and exit.
2. **Gather full context:**
   - Read the linked issue brief (`order.issueNumber`) if present.
   - Inspect `order.failedChecks` via `gh run view <runId> --log-failed` (or
     `gh pr checks <prNumber>`).
   - Refresh unresolved review threads via
     `vpx tooling/agents/queue.ts threads <prNumber>`.
   - Read every changed file in full before editing.
3. **Triage checks and review threads:**
   - **Fix** valid CI failures, lint/type/test errors, and valid CodeRabbit,
     Greptile, or maintainer review comments.
   - **Reject** a review comment only with a concrete citation from the issue
     brief, a Merit guide, or a named precedent. Reply concisely on the thread
     and add the dismissal to `verifications/<prNumber>.md` under
     `## Dismissed review findings`.
   - **Escalate** immediately (`gh pr edit <prNumber> --add-label agent:needs-human`
     plus a concise comment, then exit) if resolving the failure requires
     changing agreed behavior, touching an unapproved protected path
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
5. **Resolve threads and record shepherd state:**
   - For each addressed or answered thread ID, run:
     `vpx tooling/agents/queue.ts resolve-thread <threadId>`
   - Record the completed round:
     `vpx tooling/agents/queue.ts record-shepherd <prNumber> --round <order.nextRound> --sha $(git rev-parse HEAD)`
     (include `--issue <order.issueNumber>` when `order.issueNumber` is set).
6. Exit cleanly so CI and automated reviewers run on the updated commit.

### `implement`

Start a new `agent:ready` issue (`order.issueNumber`) while under the WIP limit.

1. **Claim the issue first:**
   Run `vpx tooling/agents/queue.ts claim <order.issueNumber>` to post a 2-hour
   `<!-- merit-claim: ... -->` marker and prevent concurrent runs from picking
   the same issue.
2. **Execute the implementation skill:**
   Follow [implement-proposal](../skills/implement-proposal/SKILL.md)
   end-to-end for `#<order.issueNumber>`.
3. Exit cleanly once the pull request is marked ready (or the issue is
   escalated to `agent:needs-human`).
