# Compose committee decisions

Use this guide when changing the decision section or its editor. The
[workflow](../../../../../../docs/workflows/record-decisions.md) owns outcomes, budget
limits, versions, and save guarantees. The editor follows the
[recommendation editor](../../../../../recommendations/web/src/views/recommendations/README.md):
a section above the recommendation, an in-panel form that starts from the saved record,
a budget preview, and a draft kept in the browser with conflict recovery.

## Connect the summary and editor

`DecisionSummary` shows the current decision, who recorded it, and its history, newest
first. `DecisionEditor` supplies the section action, the in-panel form, and the close
action as slots, so the application view decides where each goes. The application view
shows the decision editor in place of the recommendation editor while one is open.

The first decision starts from the manager recommendation's position and amount; a change
starts from the current decision. Keep the change explanation visible only once a decision
exists, and keep amount errors beside the field. The preview uses the domain's
`previewCommitment`, so it and the server agree.

The [editor stories](./decision-editor.stories.tsx) cover budget limits, amendments, and
conflict recovery. The [application page stories](../../../../../grantmaking/web/src/views/decisions/decision-editor.stories.tsx)
show the decision alongside the recommendation and version history. The controllers keep a draft and its original baseline, as the
[recommendation walkthrough](../../../../../../docs/guides/recommendation-walkthrough.md) describes.
