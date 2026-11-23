import { z } from "zod";

import type { WorkspaceToolName } from "../app/tools";
import { activeAssignment, requiredAccess } from "./authority";
import { receipt, type AssistantDependency, type AssistantPreview } from "./contracts";
import { fields } from "./evidence";
import type { AssistantContext } from "./operations";

type PreviewContext = AssistantContext & { refresh: boolean };

type Target = AssistantPreview["targets"][number];

type ApplicationSection = "review_request" | "working_revision" | "assessment";

class PreviewProblem extends Error {
  readonly status: string;
  constructor(status: string) {
    super(status);
    this.status = status;
  }
}

// Rebase only a fresh approval. Evidence-version constraints describe the user's intent.
const bindRevision = (
  ctx: PreviewContext,
  input: Record<string, unknown>,
  key: string,
  actual: number,
) => {
  if (!ctx.refresh && input[key] !== undefined && input[key] !== actual) {
    throw new PreviewProblem("conflict");
  }
  input[key] = actual;
};

const target = (kind: string, id: string, label: string, version: string | number): Target => ({
  kind,
  id,
  label,
  version: String(version),
});

const applicationContent = async (
  { actor, ops, workspaceSlug }: AssistantContext,
  applicationId: string,
  section: ApplicationSection,
  entryId?: string,
) => {
  let content = "";
  let offset = 0;
  let fingerprint: string | undefined;
  for (;;) {
    const page = await ops.grantmaking.applicationContent(actor, {
      workspaceSlug,
      applicationId,
      section,
      entryId,
      offset,
      fingerprint,
    });
    if (page.status !== "ok") {
      throw new PreviewProblem(page.status);
    }
    content += page.content;
    if (page.nextOffset === null) {
      return { value: JSON.parse(content) as unknown, version: page.fingerprint };
    }
    if (page.nextOffset <= offset) {
      throw new PreviewProblem("unavailable");
    }
    offset = page.nextOffset;
    fingerprint = page.fingerprint;
  }
};

const readContact = async ({ actor, ops, workspaceSlug }: AssistantContext, contactId: string) => {
  const result = await ops.contacts.getContact(actor, { workspaceSlug, contactId });
  if (result.status !== "ok") {
    throw new PreviewProblem(result.status);
  }
  return result.contact;
};

const managerAssignmentPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  assignmentId: string,
  applicationId: string,
) => {
  const { ops, actor, workspaceSlug } = ctx;
  const { input } = preview;
  const found = await ops.reviewer.forApplication(actor, {
    workspaceSlug,
    publicId: applicationId,
  });
  if (found.status !== "ok") {
    throw new PreviewProblem(found.status);
  }
  const assignment = found.value.find((row) => row.id === assignmentId);
  if (!assignment) {
    throw new PreviewProblem("not_found");
  }
  preview.targets.push(
    target("assignment", assignment.id, assignment.reviewer, assignment.revision),
  );
  bindRevision(ctx, input, "expectedRevision", assignment.revision);
  if (input.action === "resend") {
    preview.effects.push(`Send invitation email to ${assignment.email}.`);
  }
  if (input.action === "retry_notification") {
    if (assignment.notification !== "failed") {
      throw new PreviewProblem("conflict");
    }
    preview.effects.push(`Retry submission email to ${assignment.managerEmail}.`);
  }
  if (input.action !== "resend" && input.action !== "retry_notification") {
    preview.targets.push(
      target("review_request", assignment.requestId, assignment.reviewer, assignment.revision),
    );
  }
};

const assignmentPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  dependencies: AssistantDependency[],
  assignmentId: string,
) => {
  const { ops, actor, workspaceSlug } = ctx;
  const { input, name } = preview;
  if (typeof input.applicationId === "string") {
    return managerAssignmentPreview(ctx, preview, assignmentId, input.applicationId);
  }
  const page = await ops.reviewer.read(actor, { workspaceSlug, assignmentId });
  if (page.status !== "ok" || page.value.assignment.workspaceSlug !== workspaceSlug) {
    throw new PreviewProblem("not_found");
  }
  const { assignment, draft, material } = page.value;
  const usesEvidence = name !== "respond_to_review";
  dependencies.push({
    kind: "assignment",
    assignmentId,
    evidence: usesEvidence,
    ...(activeAssignment(assignment.status) && { active: true }),
  });
  if (usesEvidence && (!draft || !material)) {
    throw new PreviewProblem("forbidden");
  }
  if (draft && usesEvidence) {
    bindRevision(ctx, input, "expectedDraftRevision", draft.revision);
    preview.targets.push(
      target("reviewer_draft", assignmentId, assignment.applicationTitle, draft.revision),
    );
  }
  if (name === "respond_to_review") {
    bindRevision(ctx, input, "expectedRevision", assignment.revision);
  }
  preview.targets.push(
    target("assignment", assignmentId, assignment.applicationTitle, assignment.revision),
  );
  if (name === "submit_reviewer_assessment") {
    preview.changes = { assessment: draft?.content };
    preview.effects.push(
      `Share the assessment with the manager. Send notification email to ${assignment.managerEmail} if permitted by the delivery limit.`,
    );
  }
};

const invitationPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input, targets, effects } = preview;
  const requestId = z.string().parse(input.requestId);
  const request = await applicationContent(ctx, applicationId, "review_request", requestId);
  const { contactId, status } = fields(request.value);
  if (status !== "outstanding" || typeof contactId !== "string") {
    throw new PreviewProblem("conflict");
  }
  const contact = await readContact(ctx, contactId);
  if (contact.archived || !contact.email) {
    throw new PreviewProblem("invalid");
  }
  targets.push(
    target("review_request", requestId, contact.name, request.version),
    target("contact", contactId, contact.name, contact.contactRevision),
  );
  effects.push(`Send invitation email to ${contact.email.trim().toLowerCase()}.`);

  targets.push(target("assignment", z.string().parse(input.commandId), contact.name, "new"));
};

const withdrawalPreview = async (
  { actor, workspaceSlug, ops }: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const requests = new Set<string>();
  let after: string | undefined;
  do {
    const result = await ops.grantmaking.listReviews(actor, {
      workspaceSlug,
      applicationId,
      after,
      limit: 50,
    });
    if (result.status !== "ok") {
      throw new PreviewProblem(result.status);
    }
    for (const row of result.reviews.filter((row) => row.kind === "request")) {
      requests.add(row.id);
      preview.targets.push(target("review_request", row.id, row.reviewer, row.reviewRevision));
    }
    after = result.nextCursor ?? undefined;
  } while (after);
  const assigned = await ops.reviewer.forApplication(actor, {
    workspaceSlug,
    publicId: applicationId,
  });
  if (assigned.status !== "ok") {
    throw new PreviewProblem(assigned.status);
  }
  for (const assignment of assigned.value.filter((row) => requests.has(row.requestId))) {
    preview.targets.push(
      target("assignment", assignment.id, assignment.reviewer, assignment.revision),
    );
  }
  preview.effects.push("Close every outstanding review request and end access for its reviewers.");
};

const applicationChanges = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
  title: string,
) => {
  const { name, input, targets } = preview;
  if (name === "invite_reviewer") {
    await invitationPreview(ctx, preview, applicationId);
  }
  if (name === "publish_application_revision" || name === "discard_application_revision") {
    const draft = await applicationContent(ctx, applicationId, "working_revision");
    if (draft.value == null) {
      throw new PreviewProblem("conflict");
    }
    preview.changes = { workingRevision: draft.value };
    targets.push(target("working_revision", applicationId, title, draft.version));
  }
  if (name === "withdraw_application") {
    await withdrawalPreview(ctx, preview, applicationId);
  }
  if (name === "correct_assessment" || name === "cancel_review_request") {
    const id = z.string().parse(input.id);
    const section = name === "correct_assessment" ? "assessment" : "review_request";
    const current = await applicationContent(ctx, applicationId, section, id);
    targets.push(
      target(
        section,
        id,
        z.string().safeParse(fields(current.value).reviewer).data ?? id,
        current.version,
      ),
    );
  }
};

const applicationPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { actor, ops, workspaceSlug } = ctx;
  const { name, input, targets } = preview;
  const loaded = await ops.grantmaking.readApplication(actor, { workspaceSlug, applicationId });
  if (loaded.status !== "ok") {
    throw new PreviewProblem(loaded.status);
  }
  const app = loaded.application;
  const versions: Record<string, number> = {
    expectedIntakeRevision: app.intakeRevision,
    expectedReviewRevision: app.reviewRevision,
    expectedRecommendationRevision: app.recommendationRevision,
  };
  for (const [key, version] of Object.entries(versions)) {
    if (key in input) {
      bindRevision(ctx, input, key, version);
    }
  }
  if (
    (input.expectedApplicationVersion !== undefined &&
      input.expectedApplicationVersion !== app.applicationVersion) ||
    (input.expectedCriteriaVersion !== undefined &&
      input.expectedCriteriaVersion !== app.criteriaVersion)
  ) {
    throw new PreviewProblem("conflict");
  }
  if (name === "edit_application" || name === "select_application_contact") {
    input.expectedIntakeRevision = app.intakeRevision;
  }
  targets.push(
    target(
      "application",
      applicationId,
      app.title,
      name === "save_recommendation"
        ? app.recommendationRevision
        : "expectedReviewRevision" in input
          ? app.reviewRevision
          : app.intakeRevision,
    ),
  );
  await applicationChanges(ctx, preview, applicationId, app.title);
};

const roundPreview = async (ctx: PreviewContext, preview: AssistantPreview, roundId: string) => {
  const { ops, actor, workspaceSlug } = ctx;
  const { name } = preview;
  const current = await ops.grantmaking.readRound(actor, {
    workspaceSlug,
    roundId,
  });
  if (current.status !== "ok") {
    throw new PreviewProblem(current.status);
  }
  const round = current.round;
  preview.targets.push(target("round", round.roundId, round.title, round.preparationRevision));
  if (name === "edit_funding_round" || name === "delete_funding_round") {
    bindRevision(ctx, preview.input, "expectedPreparationRevision", round.preparationRevision);
  }
};

const addCreationTarget = (preview: AssistantPreview) => {
  const { name, input } = preview;
  if (
    name === "create_contact" ||
    name === "create_application" ||
    name === "create_funding_round"
  ) {
    const id = z.string().parse(name === "create_contact" ? input.contactId : input.requestId);
    preview.targets.push(
      target(
        name.slice(7),
        id,
        z.string().safeParse(input.title ?? fields(input.details).name).data ?? id,
        "new",
      ),
    );
  }
};

export const prepareWrite = async (
  context: AssistantContext,
  name: WorkspaceToolName,
  input: Record<string, unknown>,
  refresh = false,
) => {
  const ctx = { ...context, refresh };
  const preview: AssistantPreview = { name, input: { ...input }, targets: [], effects: [] };
  const dependencies: AssistantDependency[] = [{ kind: requiredAccess(name) }];
  try {
    if (typeof input.applicationId === "string") {
      await applicationPreview(ctx, preview, input.applicationId);
    }
    if (typeof input.roundId === "string") {
      await roundPreview(ctx, preview, input.roundId);
    }
    if (typeof input.assignmentId === "string") {
      await assignmentPreview(ctx, preview, dependencies, input.assignmentId);
    }
    const contactId = input.contactId ?? fields(input.change).contactId;
    if (typeof contactId === "string" && name !== "create_contact") {
      const contact = await readContact(ctx, contactId);
      if ("expectedContactRevision" in input) {
        bindRevision(ctx, preview.input, "expectedContactRevision", contact.contactRevision);
      }
      preview.targets.push(target("contact", contactId, contact.name, contact.contactRevision));
    }
    addCreationTarget(preview);
    return { ...receipt("ok"), dependencies, preview };
  } catch (error) {
    if (!(error instanceof PreviewProblem)) {
      throw error;
    }
    return { ...receipt(error.status), dependencies };
  }
};
