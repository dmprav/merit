# Define and enforce access

`@merit/access` answers: can this person perform this action on this item, given
the current facts? It owns Merit's authorization policy. Business capabilities
own their data, supply facts, and enforce the resulting decisions.

## Find the rule

The [policy table](src/domain/policies.ts) defines actions using subject and
resource attributes. An action permits any listed alternative whose requirements
all match. Workspace actions require an active account and a membership in the
resource's organization. Operator provisioning has a separate rule because it
does not require workspace membership.

The supported conditions are allowed values, equality between attributes, and
inequality between attributes. Unknown actions and missing required facts deny
access. These are fixed TypeScript definitions, not user-configurable policies.

The [member-access decision](src/domain/index.ts) also handles the proposed access
change: it protects ownership and explains forbidden self-removal or demotion.
Organizations owns the resulting membership writes and invitation revocation.

## Use current facts

```ts
import { permits } from "@merit/access";

const allowed = permits(subject, "work_on_grants", {
  organizationId: application.organizationId,
});
```

Load `subject` from current membership and account records on the server. Never
accept authoritative attributes from tool arguments, browser input, or old token
claims. Browser evaluations guide available controls; every operation checks
current authority again. Keep the existing transaction locks through commit so
access revocation cannot race a save.

## Filter queries using the same policy

`@merit/access/scope` translates the same definitions into SQL. Persistence binds
attributes to columns or expressions; these bindings describe storage and contain
no permission rules. The [organization bindings](../organizations/business/src/server/persistence/scope.ts)
join current membership and account facts, bind the resource's organization, and
restrict the caller's identity. Use these bindings for workspace queries.

Filter before counting, sorting, or pagination. A missing SQL binding or a null
required value denies access. Workspace discovery also returns the policy-derived
`canWorkOnGrants` decision for navigation; UI code need not compare role strings.

## Extend access with a capability

Add an explicit action and the facts it needs when implementing new behavior.
Relationship facts, such as an active assignment to the current membership, belong
alongside subject and resource facts. Supply the relationship itself, not a
precomputed `canRead` decision that hides policy elsewhere. Add the database
binding and test both evaluators against the same cases.

Reviewer work uses `work_on_review`: an active account must own an accepted or
submitted assignment bound to its current reviewer or program-manager membership.
Every invitation is tied to that membership's lifetime. Removing membership or
losing its review role ends access; after qualifying membership is restored, a
manager must explicitly reinstate the assignment. Grantmaking constructs a separate response
with the pinned application and criteria, the author's private draft, and their
submitted assessment. Managers cannot read private drafts. Committee readership
remains future work and needs its own explicit view and policy.

Policy expectations live in the [unit tests](src/domain/index.test.ts). The
[SQL agreement tests](tests/access.integration.ts) exercise PostgreSQL
alongside the pure evaluator. Existing Team, grant-work, and MCP integration tests
cover enforcement and revocation through public operations. See the
[verification guide](../../docs/guides/verification.md#verification) for commands.
