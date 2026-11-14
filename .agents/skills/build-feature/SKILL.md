---
name: build-feature
description: Plan, build, and review a Merit product feature end to end. Grills the requester about behavior until a self-contained feature brief is approved, anchors the work to the best existing screen, controller, and tests, delegates implementation to a builder subagent, then has an independent reviewer subagent check UI, reuse, architecture, code, and tests before opening a pull request. Use when asked to implement a user story, product feature, or new screen or workflow in Merit.
---

# Build a feature

Turn a request into a pull request the requester can merge with little checking.
The requester spends attention in one place, approving the
[feature brief](#2-grill-until-the-brief-is-approved); the rest is verified before
they see it.

Most poor results come from code written without a strong existing example to
match. Every phase anchors the work to the best established precedent and makes
each departure from it explicit and approved.

Read [AGENTS.md](../../../AGENTS.md) first. Its guidance applies throughout.

## Roles

**Three agents share the work so that judgment stays with the session that talked
to the requester, and each check starts without the context that would bias it.**

| Role         | Owns                                                             | Instructions           |
| ------------ | ---------------------------------------------------------------- | ---------------------- |
| This session | Grounding, grilling, the brief, decisions, triage, the PR        | This file              |
| Builder      | Implementing the approved brief, its tests, checks, screenshots  | [build.md](build.md)   |
| Reviewer     | Independently checking the change against the brief and the code | [review.md](review.md) |

Delegate the Builder and Reviewer to separate subagents told to follow the
instructions file and given only the inputs for that role. Keep the Reviewer
read-only where your harness supports tool restrictions, and use a faster or
lower-cost model tier for the Builder if desired. Harnesses that read
preconfigured agent definitions (such as `feature-builder` and
`feature-reviewer` in `.claude/agents/`) can start those directly. Without
subagents, do both yourself, rereading files from disk for review, and say in
the PR that the review was not independent.

## 1. Ground the request

Before asking anything, learn what the codebase already answers.

1. Read the relevant [workflow](../../../docs/workflows/README.md) and
   [domain concepts](../../../docs/domain/concepts.md) for the business behavior.
2. Find **candidate precedents** for each part: screen or story, controller, data
   adapter, business operation, and tests. Start from
   [find an existing workflow](../../../docs/guides/web-features.md#find-an-existing-workflow),
   then search for screens that present similar records or actions.
3. Choose the best candidate, not the first. Compare at least two where they
   exist, rendered in Storybook or the demo as well as in code. Prefer the one
   built most recently and most carefully: a local README or MDX, stories for its
   states, focused tests, shared components rather than local copies, and recent
   history (`git log --format='%cs %s' -- <path>`). A screen the guides name is
   usually a deliberate example. Note why the choice beat the alternative.
4. Note what each precedent offers to reuse: shared components and patterns from
   [UI development](../../../docs/guides/ui.md), controller and recovery behavior,
   test files, fixtures, and helpers.

## 2. Grill until the brief is approved

Interview the requester until you share one understanding of the feature. Walk
the decision tree in dependency order, resolving one branch before the decisions
that depend on it.

- Ask **one question at a time**, with your recommended answer and its reason, so
  the requester can reply with a word.
- Do not ask what the code or docs answer. State it as a finding they can correct.
- Ask about behavior and product meaning, not implementation the guides decide.
- Cover, where relevant: who acts and with what authority; states and transitions;
  validation and business rules; what is saved and audited; empty, long, and
  missing content; failed saves, conflicts, and recovery; MCP and other interfaces.
- Show the chosen UI precedent and the runner-up, and ask which the new screen
  should match. This question prevents most UI that looks worse than its neighbors.
- Stop when no open question would change what gets built.

Then write the brief. **The builder receives only the brief**, so it must be
complete without this conversation: if a builder would need to ask you something
the brief could have said, add it now. Write behavior as checkable statements, not
intentions.

```markdown
## Feature brief

**Outcome:** <one sentence: who can now do what, and why it matters>

**Behavior:** <agreed rules, states, edge cases, and interface effects, as
checkable bullets>

**Out of scope:** <what was discussed and deliberately excluded>

**Precedents:** <file paths; for each, what to copy and why it beat the alternative>

- UI: <screen, story, and its stylesheet>
- Behavior: <controller, data adapter, business operation>
- Tests: <test files, fixtures, and helpers to mirror>

**Plan:** <owning capability and layer for each change, from the web features
guide; the business operation; shared components to use or extend>

**Departures:** <each place the plan differs from a precedent, and the concrete
requirement that justifies it; "None" is a good answer>

**Verification:** <checks from the verification guide; UI states and widths to
screenshot beside the precedent>
```

Ask the requester to approve the brief, and wait for an explicit yes. If they ask
you to skip the grilling, still write the brief, mark your assumptions in it, and
get that yes. The approved brief is the contract for the builder, the reviewer, and
the PR; change it only with the requester's agreement.

## 3. Delegate the build

Start the builder with the approved brief, the base branch, and a screenshot
directory outside the repository. Send nothing else: no conversation summary or
extra advice. Anything the builder needs belongs in the brief.

The builder stops and returns a question instead of guessing when it meets a
behavior choice the brief does not settle or a departure the brief does not
approve. For each one, answer from the code and docs where they decide it, ask the
requester otherwise, and update the brief. Then send the answer to the builder,
or start a fresh one with the updated brief when the change is large.

When the builder reports completion, check its work before review:

- Open the screenshots and compare them with the precedent yourself. Send back any
  difference the brief does not explain.
- Read `git diff --stat <base>...HEAD`. Every file should sit where the **Plan**
  says; unexpected files mean an unplanned departure.

## 4. Review independently

Start a fresh reviewer with the brief, the base branch, and its own screenshot
directory. Do not pass the builder's report, reasoning, or screenshots, or your
view of the change. The reviewer's value is reading what the code does rather than
what its author meant.

Triage each finding:

- **Fix** by default. Return the findings to the builder as written.
- **Reject** only with a concrete reason from the brief, a guide, or a precedent.
  "Minor" or "out of scope" is not a reason for a finding about UI, reuse,
  architecture, code, or tests.
- **Ask the requester** when a finding questions agreed behavior.

A review with no findings counts only if it shows what it checked: the precedents
it read, the screenshots it compared, and each rubric section. Otherwise run it
again. After fixes beyond a few lines, start another fresh reviewer. Stop after
two rounds and carry what remains to **Follow-ups**.

## 5. Hand off

Commits follow the
[commit conventions](../../../docs/guides/development.md#commit-changes). Open a
pull request with the [repository template](../../../.github/pull_request_template.md),
keeping the description concise rather than pasting the approved brief:

- **Why:** 1–2 sentences on the outcome and the issue link.
- **What changed:** concise bullets for the resulting behavior, key departures,
  the **precedents** reused (file/story paths for review), non-CI checks run or
  gaps, any rejected review findings with their reasons, and for UI changes the
  stories/routes, states, and widths compared (or side-by-side screenshots where
  attachable), as
  [UI verification](../../../docs/guides/ui-verification.md#verification) asks.
- **Follow-ups:** only unresolved findings or concrete friction that needs
  action; omit when empty.

Greptile reviews the pull request after it opens. Triage its comments like
reviewer findings.

## 6. Learn from escapes

When the requester finds a problem the review missed, fix it, then add a checkable
item to **Known escapes** in [review.md](review.md) in the same pull request.
Phrase it as a question a reviewer can answer from the code or a screenshot, and
link the guide section it comes from. When a guide lacked the guidance, improve the
guide and link it instead. When the cause was a weak brief or precedent choice,
tighten [grounding](#1-ground-the-request) or the
[brief](#2-grill-until-the-brief-is-approved) here instead.
