-- Run with psql -v runtime_role=... against the migrated database.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT ON app_users, guest_sessions, organizations, memberships, organization_invitations,
  access_requests, access_request_limits, demo_entry_limits, grant_navigation_pins, contacts,
  funding_rounds, round_creation_receipts, criteria_versions, criteria_version_items,
  application_cases, application_creation_receipts, material_versions, material_version_answers,
  material_version_evidence, material_drafts, material_draft_answers, review_assignments,
  review_requests, review_states, reviewer_command_receipts, reviewer_drafts, reviewer_draft_observations,
  reviewer_messages, assessments, assessment_versions, assessment_version_observations,
  recommendation_versions, committee_decision_versions, audit_events, ai_reviews, ai_review_sections,
  ai_review_items, ai_review_citations, ai_review_questions TO :"runtime_role";
GRANT UPDATE ON guest_sessions, access_request_limits, demo_entry_limits, grant_navigation_pins,
  contacts, funding_rounds, application_cases, material_drafts, review_assignments,
  review_requests, review_states, reviewer_drafts TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_finish_reviewer_message(uuid, uuid, text) TO :"runtime_role";
GRANT UPDATE (id, name) ON app_users TO :"runtime_role";
GRANT UPDATE (name, demo_expires_at) ON organizations TO :"runtime_role";
GRANT UPDATE (user_id, role, administration, version) ON memberships TO :"runtime_role";
GRANT UPDATE (revoked_at, accepted_at, accepted_by, delivery) ON organization_invitations TO :"runtime_role";
GRANT UPDATE (reviewed_at, reviewed_by) ON access_requests TO :"runtime_role";
GRANT DELETE ON memberships, access_request_limits, grant_navigation_pins, funding_rounds,
  application_cases, material_drafts, material_draft_answers, reviewer_draft_observations TO :"runtime_role";
GRANT SELECT, INSERT, DELETE ON assistant_consents, assistant_conversations TO :"runtime_role";
GRANT UPDATE (status, state, revision, updated_at) ON assistant_conversations TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_running_assistant_conversations(integer, text) TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_pending_reviewer_messages(integer, uuid) TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_retry_reviewer_message(uuid) TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_workspace_running_assistant_conversations() TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_pending_invitation_dispatches(integer, text) TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.merit_acknowledge_invitation_dispatch(text, text) TO :"runtime_role";
