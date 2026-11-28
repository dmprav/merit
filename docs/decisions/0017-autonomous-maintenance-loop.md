# Review agent maintenance work after it is built

Accepted 28 November 2026. Replaces the scheduled
[maintenance scout](../../.agents/tasks/scout.md) and
[queue worker](../../.agents/tasks/queue-worker.md), which are paused until the
new loop ships.

Agents find maintenance work, prove it, build it, and carry each pull request to
merge. The maintainer reviews finished pull requests, not proposals. Only Claude
Code cloud sessions run the loop.

## Reasons

In its first week the old loop filed eight proposals while about a hundred pull
requests merged by hand. The proposals that merged were small: one test
assertion, a guidance wording, a field swap, a docs table. Each larger one
returned to the maintainer at least once, twice because the scout's brief named
code that did not exist or a plan that could not meet its own behavior. The scout
read a few files under a fixed budget, never ran code, and filed at most two
findings per lens. Approving a proposal before anything was built gave the
maintainer little to judge, so approvals went unread. Supporting any runner
added claims, leases, and REST workarounds that produced defects of their own.

## Review the result, not the proposal

Agent work goes straight from evidence to a draft pull request. The maintainer's
review moves to the diff, the Review Packet, and its screenshots. Pull requests
carry `agent:skim` when they change only docs, or only tests in one slice, without
touching protected paths or extending a mechanism; everything else carries
`agent:read`. Protected paths need no approval before building, because building
in a disposable container changes nothing. A pull request that touches one is
always `agent:read` and never merges automatically. Applied SQL migrations stay
off-limits.

During the pilot the maintainer merges every agent pull request. Tier 1 merges
automatically once at least 90% of ten or more `agent:skim` pull requests merged
without a maintainer change, and none needed a revert or a fix.

## Require evidence before filing

A bug needs a failing test on an evidence branch, a test gap needs a mutation
that survives, and any other finding needs the recorded output of a command the
scout ran. A finding without evidence is not filed. A brief that cites code no
one ran is a hypothesis, and the builder pays for testing it.

## Scale audits with change

Audits fire on activity, not a calendar: a change batch after a number of merges,
a vertical area audit when an area passes a churn threshold, a horizontal sweep
of one [architecture mechanism](../../tooling/verification/architecture/mechanisms.config.ts)
when enough merges touch it, and a records audit after new verification records.
Each run checks every concern, weighted by its scope. Change arrives unevenly, so
a rotation is too slow for the busiest areas and wasted on quiet ones, and
automatic merging will raise the rate further.

## One queue, one session per issue

Issues are the only work queue: scout findings, follow-ups that work sessions
file, and maintainer issues labelled `agent:ready`. One dispatcher starts one
cloud session per issue. That session builds through
[implement-proposal](../../.agents/skills/implement-proposal/SKILL.md) with a
fresh builder and a fresh reviewer, opens the pull request, and handles its CI
and review activity until it merges, closes, or escalates. The scout and the
builder share only the issue and its evidence branch, so the builder still tests
whether the brief stands on its own. Follow-ups more than two steps from a
finding wait for the maintainer. Work already covered or recently rejected is not
filed again. A pinned agent desk issue lists what needs the maintainer.

## Costs and reasons to reconsider

Building before review spends agent and CI time on work the maintainer may
close. Running only in Claude Code cloud ties the loop to its scheduled tasks,
sessions, and pull request subscriptions. A session that stops before its pull
request finishes must be detected and replaced.

Reconsider if the pilot misses its thresholds for yield, maintainer effort,
substance, or bad merges, or if closed agent pull requests cost more review time
than proposals did.
