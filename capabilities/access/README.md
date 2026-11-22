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
no permission rules. Organizations supplies the
[authorized workspace relation](../organizations/business/src/server/persistence/scope.ts).
Join a resource's organization ID to this relation for the required action before
counting, sorting, or pagination. Workspace discovery projects the same policy's
navigation permissions. Locking commands retain the resource, membership and
account locks through commit.

## Isolate a workspace operation

Open each workspace read or write with `readWorkspace` or `writeWorkspace` from
`@merit/organizations/transactions`. Pass the authenticated actor's internal ID
and the requested slug. PostgreSQL checks the selected workspace, current membership,
account activity and demo lifetime for each statement's snapshot. Rows such as
material versions inherit their case's workspace. The runtime sees no tenant rows
with an empty transaction context. A workspace transaction retains its actor and
workspace when calling another operation.

Personal navigation and reviewer inboxes explicitly select the actor's active
memberships across workspaces. An assignment address without a workspace slug
resolves to the assignment's organization and still requires current membership.
Organizations owns separate entry points for operator provisioning, invitation
tokens and demo creation. These operations need access before an ordinary
workspace membership exists.

When adding a tenant-owned table, include its direct organization or parent-key
policy in the migration and exercise it with the
[restricted runtime login](../grantmaking/business/tests/workspace-isolation.integration.ts).
Action and assignment checks still determine which data a member can use within
the selected organization.

## Extend access with a capability

Add an explicit action and the facts it needs when implementing new behavior.
Relationship facts, such as an active assignment to the current membership, belong
alongside subject and resource facts. Supply the relationship itself, not a
precomputed `canRead` decision that hides policy elsewhere. Add the database
binding and test both evaluators against the same cases.

The [review participation workflow](../../docs/workflows/participate-in-review.md#handle-conflicts-and-access-changes)
owns when assignments end, how they are reinstated, and who can read drafts.
[Committee readership](../../docs/workflows/committee-decisions.md#review-discussion-and-committee-readership)
remains future work and needs its own explicit view and policy.

Policy expectations live in the [unit tests](src/domain/index.test.ts). The
[SQL agreement tests](tests/access.integration.ts) exercise PostgreSQL
alongside the pure evaluator. Existing Team, grant-work, and MCP integration tests
cover enforcement and revocation through public operations. See the
[verification guide](../../docs/guides/verification.md#verification) for commands.
