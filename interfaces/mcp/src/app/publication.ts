import type { McpScope } from "../contracts";
import type { WorkspaceToolName } from "./tools";

const readAnnotations = {
  readOnlyHint: true as const,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const writeAnnotations = {
  readOnlyHint: false as const,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const read = { scope: "workspace:read", annotations: readAnnotations } as const;
const write = { scope: "grants:write", annotations: writeAnnotations } as const;
const create = { ...write, annotations: { ...writeAnnotations, destructiveHint: false } };
const notify = { ...write, annotations: { ...writeAnnotations, openWorldHint: true } };

export const publication = {
  archive_contact: write,
  cancel_review_request: write,
  correct_assessment: write,
  create_application: create,
  create_contact: create,
  create_funding_round: create,
  delete_application: write,
  delete_funding_round: write,
  discard_application_revision: write,
  edit_application: write,
  edit_funding_round: write,
  get_application: read,
  get_application_content: read,
  get_contact: read,
  get_funding_round: read,
  get_funding_round_content: read,
  get_reviewer_assignment: { ...read, scope: "reviews:read" },
  invite_reviewer: notify,
  list_application_history: read,
  list_application_reviewers: read,
  list_application_reviews: read,
  list_applications: read,
  list_contact_applications: read,
  list_contacts: read,
  list_funding_round_history: read,
  list_funding_rounds: read,
  list_my_reviews: { ...read, scope: "reviews:read" },
  list_reviewer_history: read,
  list_team_members: read,
  list_workspace_activity: read,
  list_workspaces: read,
  manage_reviewer_assignment: notify,
  mark_application_ready: write,
  publish_application_revision: write,
  record_assessment: write,
  record_committee_decision: write,
  reinstate_application: write,
  request_review: write,
  respond_to_review: { ...write, scope: "reviews:write" },
  restore_contact: write,
  save_application_revision: write,
  save_recommendation: write,
  save_reviewer_draft: { ...write, scope: "reviews:write" },
  search_workspace: read,
  select_application_contact: write,
  start_application_revision: write,
  start_demo: { ...create, scope: "onboarding:write" },
  submit_reviewer_assessment: { ...notify, scope: "reviews:write" },
  update_contact: write,
  withdraw_application: write,
} satisfies Record<
  WorkspaceToolName,
  { scope: McpScope; annotations: typeof readAnnotations | typeof writeAnnotations }
>;

export const readOnlyToolNames = Object.entries(publication)
  .filter(([, policy]) => policy.annotations.readOnlyHint)
  .map(([name]) => name);
