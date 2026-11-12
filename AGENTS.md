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
[coverage policy](docs/guides/development.md#coverage-policy-changes), including
its explicit user-approval requirement.

Maintain documentation as a coherent explanation for its reader. Read the
[documentation guide](docs/guides/documentation.md) before changing it.

When creating commits, follow the [commit conventions](docs/guides/development.md#commit-changes).
