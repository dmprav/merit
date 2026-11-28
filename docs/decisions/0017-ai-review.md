# Add an AI review of an application

Accepted 26 November 2026. A program manager can ask Merit AI to review one
application against its round's criteria and save the result as a perspective
beside reviewer assessments. The [workflow](../workflows/review-applications.md#ask-merit-ai-for-another-perspective)
describes use; this record explains the choices.

## Why it gives a funding position

An AI review that only summarized the application would leave the manager to do
the judging again. Merit AI therefore states what it can support: cited evidence,
gaps, strengths, weaknesses and concerns for each criterion, questions the manager
could put to the applicant, and an overall position with a proposed amount in the
same vocabulary as an assessment. Managers can compare it with reviewers directly,
and the position is easy to ignore, since it never counts toward anything. It carries
no numeric score and no ranking. Keeping the overall position and amount is one of
the choices to revisit once the demo has been used.

## Why it is not an assessment

An assessment is a judgment received from a person who answers for it. An AI
review is Merit AI's interpretation of the application material. It is its own
kind of record, with its own heading, author and provider. It never appears in
assessment counts, review status summaries, round allocations or budget totals,
and it is not a recommendation. Freshness uses the same
[review basis policy](../workflows/review-applications.md#review-basis-and-freshness-policy)
so managers read both kinds of record the same way.

## Why it reads only material and criteria

The model receives one material version of the application (title, applicant,
requested amount, project period, submitted date and each submitted answer) and the round's
current criteria. It never receives assessments, recommendations, staff summaries
or manager notes, contacts, or other applications. This keeps a review
reproducible from what the manager can see in the application, limits what leaves
the workspace, and stops the model from echoing a reviewer's judgment back as an
independent perspective.

Every quote the model cites must appear, ignoring case and spacing, in the field
it names. A review with an unverifiable citation, malformed output or a provider
failure is discarded whole. Nothing partial is saved.

## Why it runs only on demand

Each run sends application material to a provider and takes up to about two
minutes, so a person chooses when it happens. Nothing runs automatically on intake
or revision. Freshness tells the manager when a saved review no longer matches the
application, and **Run again** is available whenever a run is: the workspace has
consented, a provider is configured, the application is not withdrawn, and the
workspace is not the public demo. Automatic runs, and any rate
limit or quota, are follow-ups to consider after use shows whether they are needed.

The model call happens outside any database transaction or row lock. Permission,
consent and withdrawal are checked before the call and again when saving. The
result is saved against the application and criteria versions read before the
call, even if the application changed meanwhile, so freshness then reports the
change. Two runs started together both save. Saved reviews are immutable.

Every run has an identity, unique within the workspace and stored with the review,
so a retry of one run never saves a second review. A run whose identity is already
saved for the same application returns that review without calling the provider or
checking consent, the way a retried assessment returns the one already recorded. The
same identity for another application is refused as not found, and two duplicates
that finish together save one review, decided by the unique identity. The web
generates an identity per click and reuses it only to retry that submission; MCP
callers may send one and otherwise get a new one; the assistant assigns one to the
action it previews, so a retry after a lost outcome finds the saved review.

The assistant keeps the same rule. An approved `run_ai_review` is a slow tool, so
the assistant claims the action under a short lock, runs it with no conversation
lock or transaction, and applies the outcome under another short lock, instead of
executing inside the conversation's transaction as it does for other writes.
[Decision 0015](0015-merit-ai-assistant.md) still owns approval, Stop, partial
failure and retry. Stop aborts the provider request, and the run checks for it after
the provider answers and again inside the save, immediately before the insert, so a
Stop the worker has observed saves nothing. Stop reaches the worker asynchronously: a
save whose last check ran before the cancellation arrived may still commit, and then
the review stays and the action is reported as succeeded. The approved action
binds the application and criteria versions it showed, and the run refuses with
`conflict` when either has changed. A claim that lapses first looks for a review
saved under the action's run identity and records it, for a stopped action too;
only without one is a running action
reported as a failed action, never run again automatically. See
[slow tools](../guides/merit-ai.md#slow-tools-run-outside-the-conversation-lock).

## Consent and availability

Merit AI shares the workspace consent of the
[Merit AI assistant](0015-merit-ai-assistant.md): an organization owner or
administrator turns it on before Merit sends material to the provider. Turning it
off blocks new runs only. Saved reviews stay readable, because the material was
already shared under consent and the record belongs to the workspace. A run also
needs a configured provider, and a withdrawn application is not reviewed. Public
demo workspaces make no provider calls; each example application carries one
prepared review whose provider is "Example".

Only program managers who work on grants run or read AI reviews. Reviewer
members never receive them in a read model, screen, MCP tool or assistant tool
list, and the database policy refuses their connections.

## What to measure

The server outcome `ai_review_saved` ([analytics](0014-posthog-analytics.md))
counts saved runs. It carries a hashed application key, like the workspace key
and without the application's content or any person, and the freshness of the
latest earlier run (`none`, `current`, `outdated`, or `unknown`). Runs per
application and re-runs after application or criteria changes (`outdated`) show whether managers use it early, to ask the applicant for more,
or later as an additional perspective. Showing AI reviews in committee material is
a decision to revisit with that evidence.
