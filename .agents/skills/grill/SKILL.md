---
name: grill
description: Interview the requester one question at a time, each with a recommended answer, until every decision that would change the result is settled, then write a self-contained brief and get an explicit yes. Use before building a feature, changing intended behavior in a bug fix, or making any decision the requester owns, and when someone asks to be grilled or interviewed about a plan.
---

# Grill until the brief is approved

Reach one shared understanding with the requester before any code is written, and
record it in a brief that another agent could act on without this conversation.
A question asked now costs a word; a guess costs a pull request the requester has
to read closely.

The skill that called this one decides what the interview must cover and what the
brief looks like. This file owns how to interview and when to stop.

## Find what is already decided

Before asking anything, read what the codebase and docs already answer: the
relevant [workflow](../../../docs/workflows/README.md),
[domain concepts](../../../docs/domain/concepts.md), guides, and the closest
existing implementation. Present each answer you find as a finding the requester
can correct, not as a question.

## Interview

- Walk the decision tree in dependency order. Settle one branch before the
  decisions that depend on it.
- Ask **one question at a time**, with your recommended answer and its reason, so
  the requester can reply with a word.
- Ask about behavior and product meaning. Leave implementation choices that the
  guides and precedents decide to those sources.
- Use the terms in [domain concepts](../../../docs/domain/concepts.md). When the
  requester's term differs, ask which one is meant rather than adopting both.
- Stop when no open question would change the result.

## Write and approve the brief

Write the brief in the shape the calling skill gives. **Its reader receives only
the brief**: if they would need to ask you something it could have said, add it
now. Write behavior as checkable statements, not intentions, and list what was
discussed and deliberately excluded.

Ask the requester to approve the brief, and wait for an explicit yes. If they ask
to skip the interview, still write the brief, mark your assumptions in it, and get
that yes. Change an approved brief only with the requester's agreement.

When the interview settles a term the [domain concepts](../../../docs/domain/concepts.md)
lack, or a consequential choice with lasting trade-offs, include the concept entry
or a [decision record](../../../docs/decisions/README.md) in the same change, as the
[documentation guide](../../../docs/guides/documentation.md#give-knowledge-a-clear-home)
describes.
