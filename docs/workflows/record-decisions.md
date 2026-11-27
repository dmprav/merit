# Record committee decisions

A committee decides outside Merit. A program manager records what it decided for an
application through web and MCP, so authorized commitments stay distinct from the
manager's [recommendation](recommend-funding.md) and the round's budget accounts for
the funding already committed. Recording a decision does not notify the applicant,
publish anything, or create an award agreement or payment.

## What a decision records

Each application has one decision, kept as numbered versions that are never deleted.

| Outcome              | Amount     | Conditions               |
| -------------------- | ---------- | ------------------------ |
| Fund                 | Above €0   | None                     |
| Fund with conditions | Above €0   | Required; counts in full |
| Defer                | Exactly €0 | None                     |
| Decline              | Exactly €0 | None                     |

Every version also carries:

- a **reason**, up to 5,000 characters;
- **Decided by**, the body that decided, such as "Funding committee", up to 200
  characters;
- a **decision date** that is not after today, anywhere on Earth, as for a
  [withdrawal](record-applications.md#withdraw-or-reinstate-an-application);
- from the second version on, a **change explanation**, up to 2,000 characters.

Amounts are in EUR with at most two decimal places. Excess precision is rejected beside
the field and never rounded ([money decision](../decisions/0008-money.md)).

Merit records who saved the version separately from Decided by: the signed-in person's
name at the time, whether the web or an MCP client saved it, the time, and the
application's recorded material version. Authorship supplied by a client cannot replace
it.

Every outcome can change, including a final one. A correction and a later meeting's
decision after a deferral are both new versions with an explanation. Saving without
changing the outcome, amount, conditions, reason, Decided by, or date records nothing, asks
for no explanation, and closes the editor with **No changes to record**.

A manager recommendation is not required. A decision never changes the recommendation, and
the recommendation stays editable afterwards.

## When a decision can be saved

The operation checks, under the round and application locks:

- the actor is a current program manager (MCP also needs the `grants:write` scope);
- the application is not withdrawn (`application_withdrawn`);
- Fund and Fund with conditions need [ready application material](record-applications.md#save-preparation-and-mark-it-ready)
  (`application_not_ready`); Defer and Decline do not;
- the decision revision the person saw is still current, otherwise the save is a conflict.

## Committed funding and the round budget

**Committed** is the sum of the current Fund and Fund with conditions amounts of the
round's non-withdrawn applications. Conditional awards count in full; a deferral or decline
reserves nothing. **Available** is the budget less what is committed. Neither changes the
**Proposed** total, which still comes only from recommendations.

Funding must fit the budget. A Fund or Fund with conditions save is rejected when the round
has no budget (`budget_required`) or when the committed total after the save would exceed it
(`commitment_exceeds_budget`, which reports the budget, committed total, and excess). Defer
and Decline are never blocked by budget. For a €60,000 round, a €24,000 award and a €28,000
conditional award leave €8,000 available, so a further €9,000 award is rejected.

The round's budget cannot then fall below what is committed or be removed while anything is
committed (`budget_below_commitments`, which shows the committed total). The existing reason
for a budget change still applies. See [Prepare a round](prepare-round.md#set-the-budget-and-criteria).

## Effects on other work

- An application whose current decision is Fund or Fund with conditions cannot be withdrawn
  (`application_has_commitment`). Record a new version first, such as Decline with an
  explanation.
- An application with a current Defer or Decline can be withdrawn. Its decision then stays
  readable but cannot change, as a recommendation does, and reinstating the application makes
  it editable again.
- An application with any decision cannot be deleted
  ([Record applications](record-applications.md#delete-unused-preparation)).

## In the browser

The application panel shows **Committee decision** above **Recommendation**: the outcome,
amount, conditions, reason, who decided and when, who recorded it and when, and the version
history, newest first. **Record decision** and **Change decision** open an in-panel editor
that starts from the current decision or, for the first one, from the manager recommendation's
position and amount (Fund with a condition becomes Fund with conditions). The editor shows
the recommendation for comparison and previews the committed and available funding, or the
excess, before saving. It asks for a change explanation only when a saved decision is being changed. A
withdrawn application shows its decision without an edit action.

A draft is kept in this browser like a recommendation draft. If the decision changed while it
was open, the person can reaffirm the draft against the latest version or discard it and load
the latest. The round's application list adds a **Decision** column beside the recommendation,
and its budget summary adds Committed and Available beside Proposed, with the same note on
withdrawn applications.

## In MCP

`record_committee_decision` takes the application, outcome, amount, conditions, reason,
`decidedBy`, `decisionDate`, `changeExplanation` when amending, and
`expectedDecisionRevision` (0 for the first). `get_application` returns the current decision
with its revision and recorder. Round reads return committed and available totals wherever
they return proposed totals. Sections `decision` and `decision_change` and history `decision`
read the versions.

## Audit and analytics

Each new version writes a `decision.recorded` (first) or `decision.amended` audit event, with
the decision revision and the round and application, in the same transaction; a failure to
record it leaves the decision unsaved. [Activity](review-and-decide.md#catch-up-on-shared-changes)
shows **Decision recorded** and **Decision amended** with the explanation beside the entry.
Each saved version also emits the `committee_decision_recorded` outcome, by web or MCP surface
and workspace kind.

Committee packs, voting, approval routing, committee readers, award terms, and payments are
not implemented. [Future committee design](committee-decisions.md) covers the rest.

[All workflows](README.md)
