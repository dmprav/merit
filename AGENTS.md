# Working on Merit

Build coherent capabilities that help people understand evidence and carry out
grant work. Choose a scope that can be completed with care across product, code,
and experience.

## Make informed choices

Understand the intended outcome, domain meaning, and existing behavior before
choosing a solution. Start with the [documentation areas](docs/README.md),
then use topic indexes and repository search to find relevant guidance and code.
Ground product, experience, and design choices in the project's
[foundations](docs/foundations/README.md).

Before introducing or replacing an implementation, inspect the relevant shared
foundation contracts and the closest existing implementation, including its tests.
For substantive changes, briefly name these references, what you will reuse or
extend, and which behavior must remain consistent before editing. If no suitable
implementation exists, state what you inspected and the gap. Prefer extending the
existing owner when the responsibility is shared; explain departures through a
concrete requirement or limitation.

When changing business behavior, follow the
[domain-driven design guidance](docs/foundations/architecture.md#model-grant-work-explicitly).
Keep business meaning consistent across interfaces, place rules with the capability
that owns them, and make consequential behavior explicit and testable.

## Optimize for the long term

Choose solutions that keep Merit understandable, dependable, and easy to evolve.
Weigh immediate effort against the ongoing cost of using, maintaining, and changing
the product. Address underlying problems when local fixes would leave recurring
complexity. Keep scope focused on demonstrated needs; add flexibility when there
is a concrete reason for it.

## Complete the change

Keep each change focused on one outcome that can be explained, reviewed, and
verified together. Include the implementation, affected interfaces, tests, and
documentation needed to complete it. Separate unrelated fixes, cleanup, and
refactoring. For larger work, look for independently useful, mergeable steps that
leave the application coherent. Keep tightly coupled changes together when
splitting them would make correctness harder to assess.

Review the completed change against the references you selected for duplicated
responsibilities and inconsistent behavior.

Choose the smallest set of checks that covers the changed behavior and affected
boundaries, including applicable coverage requirements. Reuse passing results
while their relevant inputs remain unchanged, and stop once the applicable checks
pass. Repeat or broaden verification only when subsequent edits, failures, or
unresolved risks justify it. Follow the [verification guide](docs/guides/verification.md)
for check selection and full workspace verification milestones; use the
[development guide](docs/guides/development.md) for setup.

Before weakening coverage or required tests, follow the
[coverage policy](docs/guides/testing.md#coverage-policy-changes), including
its explicit user-approval requirement.

Maintain documentation as a coherent explanation for its reader. Read the
[documentation guide](docs/guides/documentation.md) before changing it.

When creating commits, follow the [commit conventions](docs/guides/development.md#commit-changes).

## Engineering principles

Read the relevant card in [engineering principles](docs/foundations/principles.md)
when a task triggers it. Cite a principle only when it changed a concrete
decision, and state what changed.

| Principle                                                                                        | When to apply                                       | Core rule                                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Model the domain](docs/foundations/principles.md#model-the-domain)                              | Stateful logic, status flags, repeated conditionals | Encode states in a union, structure, or `business` rule instead of synced flags  |
| [Match the best precedent](docs/foundations/principles.md#match-the-best-precedent)              | New feature, new pattern, boundary change           | Reuse the best precedent; sketch two shapes first if none fits                   |
| [Subtract before you add](docs/foundations/principles.md#subtract-before-you-add)                | Replacing APIs, schemas, UI, or workflows           | Delete dead weight first; migrate callers and drop old APIs in one wave          |
| [Minimize reader load](docs/foundations/principles.md#minimize-reader-load)                      | Shaping commands, controllers, helpers              | One abstraction level; collapse one-caller wrappers; shrink mutable state        |
| [Validate at boundaries](docs/foundations/principles.md#validate-at-boundaries)                  | External/DB/route inputs, optional state            | Parse once with Zod; use constructive types over `!`, `as`, or suppressions      |
| [Make operations idempotent](docs/foundations/principles.md#make-operations-idempotent)          | Retries, scripts, locks, parallel work              | Converge retries on the same state; separate shared state before locking         |
| [Sequence verifiable units](docs/foundations/principles.md#sequence-small-verifiable-units)      | Multi-step fixes, refactors, commit stacking        | Land minimal units ending in checks; put failing repro or deletions first        |
| [Verify at the owning layer](docs/foundations/principles.md#verify-behavior-at-the-owning-layer) | Writing or reviewing tests                          | Test observable outcomes once in the owning package; justify higher-layer copies |
| [Prove it on the real surface](docs/foundations/principles.md#prove-it-on-the-real-surface)      | Declaring done or filing bug findings               | Verify with real screenshots, DB runs, or executed repros—never proxies alone    |
| [Fix root causes](docs/foundations/principles.md#fix-root-causes)                                | Debugging or repeated CI/gate failures              | Trace to the first wrong step; test the shared premise directly after 2 fails    |
| [Explain the number](docs/foundations/principles.md#explain-the-number)                          | Reporting latency, query, or size numbers           | Name the limiter, run 5+ interleaved trials, verify outputs, check end-to-end    |
| [Encode repeat fixes](docs/foundations/principles.md#encode-repeat-fixes-in-structure)           | Same mistake class appears twice                    | Escalate from prose to architecture, types, lint/CI, or tests; retire prose      |

## Rule enforcement

When the same mistake recurs, move enforcement up the ladder (**architecture →
types → lint or CI → tests → documentation**) and prove a new static or test
check fails on the past mistake. Rules still marked prose/review below are the
next candidates for tooling.

| Rule                                         | Enforcer                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capability, role, and browser/server seams   | `vp run architecture` ([architecture config](tooling/verification/architecture/config.ts))                                                       |
| Dead code, unused exports, package cycles    | `vp run code-health` & `vp run architecture` ([Fallow config](.fallowrc.jsonc))                                                                  |
| Function length, complexity, unsafe `any`    | `vp run check:code` & `vp run check:complexity` ([lint rules](tooling/verification/lint.ts))                                                     |
| Business core branch coverage                | `vp run <package>#test` ([probe tests](tooling/verification/checks.test.ts))                                                                     |
| Shared components expose no escape hatches   | `vp run @merit/ui#test`, `@merit/forms#test`, `@merit/tables#test` ([public contract](foundation/ui/src/public-contract.test.tsx))               |
| Notice controls sit in its `actions`         | `vp run test:stories` ([Storybook preview](tooling/storybook/.storybook/preview.tsx))                                                            |
| One labelled action per page header          | `vp run test:stories` ([Storybook preview](tooling/storybook/.storybook/preview.tsx))                                                            |
| Feature CSS leaves type and color to the UI  | `vp run check:css` ([stylelint config](stylelint.config.mjs), [probe tests](tooling/verification/checks.test.ts))                                |
| Documentation links, headings, PR records    | `vp run check:docs`, `vp run test:docs`, `vp run test:ci` ([verification record](tooling/verification/verification-record.ts))                   |
| Secret scanning and dependency advisories    | `vp run check:security` ([secrets config](tooling/verification/secrets.config.ts))                                                               |
| No `!`, `as`, or unreasoned suppressions     | Prose/review ([coding conventions](docs/guides/coding-conventions.md#readability-and-safety)); candidate for `lint.ts`                           |
| Single-behavior tests, UI parity, benchmarks | Prose/review ([testing](docs/guides/testing.md), [UI verification](docs/guides/ui-verification.md), [verification](docs/guides/verification.md)) |

## Agent delegation

- Route bulk code reading and independent exploration to subagents, passing file
  pointers and concise briefs rather than raw dumps.
- Give mutating reviewers (such as mutation checks or repro scripts) and
  parallel workers separate git worktrees so checkouts do not collide.
- Start review-fix rounds and retries with a fresh subagent given the brief,
  current branch, and findings instead of resuming a bloated context.
