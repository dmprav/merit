# Request and record reviews

Review requests track expected work; assessments record judgments received.
Program managers do both through web and MCP, including in the demo. They can also
[invite reviewers to submit their own assessments](participate-in-review.md) in
standard workspaces through the browser or MCP. Manager-recorded assessments continue
to support reviews received from people without Merit accounts.
Use written observations against criteria, overall reasoning, a funding position,
and a proposed amount where stated. Numeric scores and automatic ranking are outside
this capability.

## Request reviews

A manager selects or adds a workspace contact as the reviewer for an application.
Record the request and the application and criteria versions associated with it.
Managers arrange reviews through their existing communication channels. Adding a
request only tracks the work: it sends no invitation, notification, or reminder.
Choose **Invite reviewer** separately to send an assignment invitation after the
contact has joined the workspace as a reviewer or program manager. An owner or
administrator can invite them through Members & access first. The demo supports
tracking and recording only.

A request stays outstanding until an assessment is recorded against it or it is
cancelled. Replacing a reviewer closes the unfinished request and creates one for
the replacement; it never transfers authorship of an assessment. A follow-up request
creates new outstanding work while retaining earlier requests and judgments.
Choosing a reviewer records the request immediately. Current outstanding reviewers
cannot be requested again. A failed save preserves the choice for retry; changed
grant work requires starting the request again against current state. A follow-up
request for a known reviewer can act directly. Existing request drafts remain
resumable.

Withdrawing the application closes its outstanding requests, which read **Closed:
application withdrawn**, separately from a manager's cancellation. While it is
withdrawn, no review work can be recorded; reinstating it does not reopen the
closed requests, so managers request again or use **Reinstate assignment**.
[Withdraw or reinstate an application](record-applications.md#withdraw-or-reinstate-an-application)
explains what withdrawal keeps and which writes it refuses.

**Request history** keeps the reviewer, status, submission and criteria versions, and dated
creation and closure events together, including the people and interfaces responsible.
Inspecting request history and review details preserves the context of surrounding
judgments.

## Record a received assessment

A manager can record an assessment with or without a prior request. Associate it
with an existing request when it fulfils that work. Require the reviewer's name
and substantive assessment text; observations against individual criteria are
optional. Preserve the judgment received, including its omissions. An unstated
funding position or amount is **Not stated**, distinct from deferral or zero.
The manager's own interpretation belongs in their recommendation.

Changing the criteria basis retains written notes, including notes for criteria no
longer in the selected version; it does not silently discard received judgments.
Existing notes remain available when editing or reopening a draft. Notes follow
criterion identities across renames and duplicate titles, retaining their recorded
labels. Notes whose criterion is unknown remain unlinked; older title-only notes
are never silently attached to an identified criterion. Technical identity changes
alone do not change review freshness: the criteria-content comparison still
compares ordered titles and guidance.

A substantive received assessment fulfils an associated request even when it lacks
a position or amount. Receipt, completeness, and freshness remain separate facts.
Merit records the manager and recording timestamp separately from the reviewer:
**Assessment by Sam Morgan, recorded by Dana Reed**. Do not present manager entry
as authenticated submission by the reviewer or invent an unknown assessment date.

The manager explicitly identifies the application version reviewed and the criteria
basis when known. A request's basis can be suggested but is not proof of what the
reviewer used. Preserve **Review basis unknown** when it cannot be established;
recording an assessment today must not imply that it assesses today's material.

## Correct a record or record a follow-up

**Edit recorded assessment** corrects what a manager entered. Any current program
manager can correct a manager-recorded assessment; retain previous saved content, recording actors,
and timestamps automatically. A change note is optional, and the manager does not
have to classify the correction.

Reviewers amend their own authenticated submissions with an explanation. Managers
cannot edit those submissions or fulfil an invited assignment on the reviewer’s behalf.

**Record follow-up assessment** captures a later judgment received from the reviewer,
optionally fulfilling a follow-up request. Preserve the earlier assessment and its
basis. Show the latest assessment first with earlier judgments and edit history
available. Neither action makes the recording manager the author of the judgment.

## Ask Merit AI for another perspective

A program manager can ask Merit AI to review an application against its round's
current criteria, at intake to find what to ask the applicant for or later as an
additional perspective beside reviewer assessments. An application that is not yet
marked ready, or that has no submitted answers, can be reviewed; the review reports
the gaps. The [decision](../decisions/0016-ai-review.md) explains the choices.

An **AI review** is its own record, shown apart from reviewer assessments with
"Merit AI" as its author. It is never an assessment, never counts in review
status, and never changes round allocation or budget totals. It contains:

- for each current criterion, in order, claims with verbatim quoted evidence, gaps,
  strengths, weaknesses and concerns; a round without criteria receives one
  whole-application section;
- questions for the applicant, up to 20;
- reasoning and an overall funding position and amount, with the same rule as an
  assessment: Fund and Fund with a condition state a positive amount, Defer and
  Decline state zero. There are no numeric scores and no ranking.

Merit AI receives only the application's current material version (title,
applicant, requested amount, project period and submitted answers) and the round's
criteria. It never receives assessments, recommendations, staff summaries or
manager notes, contacts, or other applications. Every quotation must appear in the
field it cites; a review with an unverifiable citation is rejected.

Runs happen only on request through the web or the `run_ai_review` MCP tool,
and only when all of these hold. Otherwise the application page explains why and the
tool returns `not_available` with the reason:

| Reason                  | Meaning                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `consent_required`      | An organization owner or administrator has not turned on Merit AI for the workspace. |
| `provider_unconfigured` | The server has no model provider.                                                    |
| `withdrawn`             | Withdrawn applications are not reviewed.                                             |
| `demo`                  | A public demo shows a prepared example for each application and runs no new review.  |

A run takes up to about two minutes. If the provider fails, times out, or returns
output that does not validate, **nothing is saved** and the manager can try again.
Permission, consent and withdrawal are checked again when saving. The saved review
records the application and criteria versions read when the run started, the
provider and model, who ran it and through which interface. Saved reviews are
immutable and are removed only with their workspace. Turning consent off blocks
new runs; saved reviews stay readable.

Freshness follows the [review basis policy](#review-basis-and-freshness-policy)
unchanged: a saved AI review is current, outdated or unknown. Managers can run
again at any time, and an outdated review stays readable. Only program managers
see AI reviews; reviewer members never do.

## Respond to application and criteria changes

The round's Applications list distinguishes outstanding requests, current and
outdated assessments, changed criteria, and unknown review basis, with a route to
the relevant work. Application revisions preserve earlier assessments and flag
those based on older material. A revision does not automatically request another
review.

Criteria remain editable after review begins. Before saving a changed list, show
how many recorded assessments and outstanding requests are affected. Saving retains
the previous criteria. Existing requests and assessments keep their original basis;
users can inspect it alongside the current criteria. Saving unchanged criteria
creates no new version.

### Review basis and freshness policy

Reviews owns these comparisons for manager views, reviewer assignments, and MCP.
This is Merit's product policy for the prototype, not a claim that all funders
use the same definition of freshness.

| Comparison          | Meaning                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application version | Compare the recorded and current versions of the same application. A different version flags changed material, even if later edits restore earlier text.                                         |
| Criteria version    | Compare revision numbers within the same round. This preserves revision identity independently of content equality.                                                                              |
| Criteria content    | Compare the ordered titles and descriptions exactly. Missing and empty descriptions are equivalent; wording, case, whitespace, and order changes count. An empty criteria list is known content. |
| Unknown comparison  | If either side is unavailable, report unknown; never substitute current criteria for an unknown recorded basis. A known content comparison does not establish a missing revision identity.       |

Assessment freshness uses application-version and criteria-content comparisons.
A known difference in either makes the assessment **outdated**, even if another
comparison is unknown. With no known difference, an unknown application version
or criteria content makes freshness **unknown**. Otherwise it is **current**.
An outstanding request remains **outstanding** regardless of its basis; change
flags remain available so the manager can decide whether to update instructions.

If criteria change from A to B and back to A, an assessment of A has a different
criteria version but matching content. It is current when the application version
also matches. **Criteria changed since this assessment** therefore means that the
current criteria content differs, not merely that an intervening revision exists.
Every content difference counts without asking managers to classify wording and
substantive changes. Revision history and the pinned basis remain intact.

A change flag does not make an assessment worthless or require it to be redone.
Managers decide whether further review is needed and record any follow-up judgment
through the same workflow. Outstanding requests, outdated assessments, changed
criteria, and unknown basis do not block saving the manager's recommendation.
Saving that recommendation does not resolve those gaps.

Keep submitted material available while consulting assessments, their basis, and
outstanding requests. Preserve the person's reading context as they move between
evidence, review work, and the round.

## Recreate the demo through ordinary work

Starting from an empty workspace, a manager can create a round and applications,
request reviews from Sam and Jules, and record their differing judgments. For
Workshop Saturdays, record Sam's assessment of the €18,000 request while Jules's
request remains outstanding. Then record the revised €22,000 application after the
loss of a free venue. Sam's assessment becomes outdated, Jules's request remains
outstanding, and the manager's earlier recommendation remains intact until changed.
This sequence must be achievable through ordinary controls without seeded assessments
or reviewer accounts.

Assessment editors follow the shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx).
Writes check the original review revision and current application and criteria
versions, then preserve attribution and history with the change. The
[review presentation guide](../../capabilities/reviews/web/src/views/reviews/README.md)
connects request controls, assessment forms, and reading views to their examples.

Next: [form a funding recommendation](recommend-funding.md). See the
[grantmaking overview](review-and-decide.md) for access and shared guarantees.
