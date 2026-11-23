# Build a workspace-scoped Merit AI assistant

Accepted 23 November 2026. This brief describes the first backend milestone.
The [current demo](../workflows/public-demo-and-access.md#try-merit-ai-beside-a-page)
uses recorded examples.

## Investigate grant work

A person can ask an open-ended question in a private conversation within one
workspace. The model chooses tools, follows up on what it learns, and asks for
clarification when needed. An attached page gives the model a starting point.
It can follow relevant evidence across applications, reviews, rounds, and
contacts within the person's authority in that workspace.

An organization administrator must opt in before Merit sends workspace material
to the configured provider. Merit supplies the provider account. Start with one
model integration. Provider and model selection remain open.

Support the full [existing AI tool catalog](../../interfaces/mcp/src/app/tools.ts)
by reusing the capability-owned tools with the current actor. Business
capabilities enforce permissions, revisions, and committed changes. The assistant
backend owns the turn, tool execution, evidence references, approval, and recovery.
Material claims cite the records and versions that support them. When a later
revision appears, the citation still identifies the version used for the answer.

## Preview every write

Before execution, show the affected records, exact changes, and external effects
such as sending email. This applies even when the user explicitly requested the
edit. Bind approval to the previewed action. Recheck authority and relevant
revisions at execution. When a change makes the preview stale, obtain approval
for an updated preview.

A single confirmation can cover several writes when every action can be previewed
up front. If a later action depends on information an earlier one will produce,
preview it separately once its details are known. Report outcomes individually.
On partial failure, continue independent actions and stop dependent ones. Retrying
failed work must preserve already completed changes and deliveries.

## Keep conversations and work recoverable

Closing the tab lets an active turn finish or wait for approval. Stop ends
further assistant work. Reopening the conversation shows saved progress,
pending previews, and outcomes.

Track the permissions used to supply information to each conversation, including
uncited tool results. If the person loses a required permission, make the whole
conversation unavailable, stop further work, and block pending approvals. A
follow-up question or pending preview can repeat confidential material from an
earlier answer. Protecting the whole conversation covers those copies, at the
cost of closing a mixed-topic conversation when one assignment becomes
inaccessible. The person can start a new conversation under current permissions.

Retain conversations until their owner deletes them or the workspace is deleted.
Deleting a chat cancels pending approvals. Completed business actions follow
their ordinary grant and audit retention rules.

## Verify the milestone

A manager asks which applications need attention before committee. Merit
investigates, follows the evidence, and cites the submissions and assessments
behind its findings. The manager then asks Merit to invite three reviewers.
Merit previews all three recipients and the email effect. After confirming,
the manager closes the tab. On return, they can see each outcome and retry a
failed delivery without resending successful invitations.

Cover permissions, approvals, cancellation, and safe retries with ordinary
contract and integration tests. Defer the model-quality evaluation harness.
