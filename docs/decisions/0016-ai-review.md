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
requested amount, project period and each submitted answer) and the round's
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
application, and **Run again** is always available. Automatic runs, and any rate
limit or quota, are follow-ups to consider after use shows whether they are needed.

The model call happens outside any database transaction or row lock. Permission,
consent and withdrawal are checked before the call and again when saving. The
result is saved against the application and criteria versions read before the
call, even if the application changed meanwhile, so freshness then reports the
change. Two runs started together both save. Saved reviews are immutable.

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
counts saved runs. Runs per application and re-runs after application or
criteria changes show whether managers use it early, to ask the applicant for more,
or later as an additional perspective. Showing AI reviews in committee material is
a decision to revisit with that evidence.
