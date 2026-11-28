import type { publication } from "../app/publication";
import type { AssistantToolName } from "../app/tools";
import type { AssistantDependency, AssistantPreview } from "./contracts";
import type { PreviewContext } from "./preview-records";
import {
  aiReviewPreview,
  assignmentPreview,
  cancelReviewPreview,
  correctAssessmentPreview,
  invitationPreview,
  managerAssignmentPreview,
  recommendationPreview,
  recordAssessmentPreview,
  requestReviewPreview,
  withdrawalPreview,
} from "./preview-reviews";
import {
  application,
  contact,
  newContact,
  proposed,
  round,
  workingRevision,
} from "./preview-targets";

type Access = Exclude<AssistantDependency["kind"], "assignment">;

type PreviewStep = (
  ctx: PreviewContext,
  preview: AssistantPreview,
  dependencies: AssistantDependency[],
) => void | Promise<void>;

type WritePreview = [PreviewStep, ...PreviewStep[]];

const read = (access: Access) => ({ access, preview: null });

const write = (access: Access, ...preview: WritePreview) => ({ access, preview });

const grants = read("grants");
const intake = application("intakeRevision");
const linkedContact = contact("contactId");
const changeContactStatus = write("grants", contact("contactId", true));
const changeWorkingRevision = write("grants", application("intakeRevision", workingRevision));
const changeRound = write("grants", round(true));

export const assistantPolicy = {
  archive_contact: changeContactStatus,
  cancel_review_request: write("grants", application("reviewRevision", cancelReviewPreview)),
  correct_assessment: write("grants", application("reviewRevision", correctAssessmentPreview)),
  create_application: write("grants", round(false), proposed("application")),
  create_contact: write("grants", newContact),
  create_funding_round: write("grants", proposed("round")),
  delete_application: write("grants", intake),
  delete_funding_round: changeRound,
  discard_application_revision: changeWorkingRevision,
  edit_application: write("grants", intake, contact("change.contactId")),
  edit_funding_round: changeRound,
  get_application: grants,
  get_application_content: grants,
  get_contact: grants,
  get_funding_round: grants,
  get_funding_round_content: grants,
  get_reviewer_assignment: read("reviewer"),
  invite_reviewer: write("grants", application("context", invitationPreview)),
  list_application_history: grants,
  list_application_reviewers: grants,
  list_application_reviews: grants,
  list_applications: grants,
  list_contact_applications: grants,
  list_contacts: grants,
  list_funding_round_history: grants,
  list_funding_rounds: grants,
  list_my_reviews: read("reviewer"),
  list_reviewer_history: grants,
  list_team_members: read("team"),
  list_workspace_activity: grants,
  list_workspaces: read("membership"),
  manage_reviewer_assignment: write("grants", application("context", managerAssignmentPreview)),
  mark_application_ready: write("grants", intake),
  publish_application_revision: changeWorkingRevision,
  read_ai_reviews: grants,
  record_assessment: write(
    "grants",
    application("reviewRevision", recordAssessmentPreview),
    linkedContact,
  ),
  record_committee_decision: write("grants", application("decisionRevision")),
  reinstate_application: write("grants", intake),
  request_review: write(
    "grants",
    application("reviewRevision", requestReviewPreview),
    linkedContact,
  ),
  respond_to_review: write("reviewer", assignmentPreview("respond")),
  restore_contact: changeContactStatus,
  run_ai_review: write("grants", application("material", aiReviewPreview)),
  save_application_revision: write("grants", intake, linkedContact),
  save_recommendation: write(
    "grants",
    application("recommendationRevision", recommendationPreview),
  ),
  save_reviewer_draft: write("reviewer", assignmentPreview("save_draft")),
  search_workspace: grants,
  select_application_contact: write("grants", intake, linkedContact),
  start_application_revision: write("grants", intake),
  submit_reviewer_assessment: write("reviewer", assignmentPreview("submit")),
  update_contact: write("grants", linkedContact),
  withdraw_application: write("grants", application("intakeRevision", withdrawalPreview)),
} satisfies {
  [Name in AssistantToolName]: {
    access: Access;
    preview: (typeof publication)[Name]["annotations"]["readOnlyHint"] extends true
      ? null
      : WritePreview;
  };
};
