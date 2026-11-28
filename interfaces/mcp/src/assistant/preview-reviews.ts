import { z } from "zod";

import { activeAssignment } from "./authority";
import { fields, type AssistantDependency, type AssistantPreview } from "./contracts";
import {
  applicationContent,
  bindRevision,
  PreviewProblem,
  readContact,
  target,
  type PreviewContext,
} from "./preview-records";

export const managerAssignmentPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const assignmentId = z.string().parse(preview.input.assignmentId);
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
    const request = await applicationContent(
      ctx,
      applicationId,
      "review_request",
      assignment.requestId,
    );
    preview.targets.push(
      target("review_request", assignment.requestId, assignment.reviewer, request.version),
    );
  }
};

export const assignmentPreview =
  (action: "respond" | "save_draft" | "submit") =>
  async (ctx: PreviewContext, preview: AssistantPreview, dependencies: AssistantDependency[]) => {
    const { ops, actor, workspaceSlug } = ctx;
    const { input } = preview;
    const assignmentId = z.string().parse(input.assignmentId);
    const page = await ops.reviewer.read(actor, { workspaceSlug, assignmentId });
    if (page.status !== "ok" || page.value.assignment.workspaceSlug !== workspaceSlug) {
      throw new PreviewProblem("not_found");
    }
    const { assignment, draft, material, assessment } = page.value;
    const usesEvidence = action !== "respond";
    if (usesEvidence && (!draft || !material)) {
      throw new PreviewProblem("forbidden");
    }
    dependencies.push({
      kind: "assignment",
      assignmentId,
      evidence: usesEvidence,
      ...(activeAssignment(assignment.status) && { active: true }),
    });
    if (draft && usesEvidence) {
      bindRevision(ctx, input, "expectedDraftRevision", draft.revision);
      preview.targets.push(
        target("reviewer_draft", assignmentId, assignment.applicationTitle, draft.revision),
      );
    }
    if (action === "respond") {
      bindRevision(ctx, input, "expectedRevision", assignment.revision);
      if (input.action === "decline") {
        preview.targets.push(
          target(
            "review_request",
            assignment.requestId,
            assignment.applicationTitle,
            `assignment revision ${assignment.revision}`,
          ),
        );
        preview.effects.push(
          "Cancel the linked review request and update the application's review revision.",
        );
      }
    }
    preview.targets.push(
      target("assignment", assignmentId, assignment.applicationTitle, assignment.revision),
    );
    if (action === "submit") {
      preview.targets.push(
        target(
          "assessment",
          assessment?.id ?? assignmentId,
          assignment.reviewer,
          assessment?.versions.length ?? "new",
        ),
      );
      preview.changes = {
        assessment: draft?.content,
        applicationVersion: assignment.applicationVersion,
        criteriaVersion: assignment.criteriaVersion,
        requestId: assignment.requestId,
      };
      preview.effects.push(
        `Share the assessment with the manager. Send notification email to ${assignment.managerEmail} if permitted by the delivery limit.`,
      );
    }
  };

export const invitationPreview = async (
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

export const withdrawalPreview = async (
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

const reviewRecordTarget = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
  section: "review_request" | "assessment",
  id: string,
) => {
  const current = await applicationContent(ctx, applicationId, section, id);
  const row = fields(current.value);
  const version =
    section === "assessment" && Array.isArray(row.versions) ? row.versions.length : current.version;
  preview.targets.push(target(section, id, z.string().safeParse(row.reviewer).data ?? id, version));
  return version;
};

const cancelledAssignment = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
  requestId: string,
) => {
  const assigned = await ctx.ops.reviewer.forApplication(ctx.actor, {
    workspaceSlug: ctx.workspaceSlug,
    publicId: applicationId,
  });
  if (assigned.status !== "ok") {
    throw new PreviewProblem(assigned.status);
  }
  const assignment = assigned.value.find((row) => row.requestId === requestId);
  if (assignment && activeAssignment(assignment.status)) {
    preview.targets.push(
      target("assignment", assignment.id, assignment.reviewer, assignment.revision),
    );
    preview.effects.push(`End ${assignment.reviewer}'s access to this review assignment.`);
  }
};

export const requestReviewPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input, targets } = preview;
  targets.push(target("review_request", z.string().parse(input.id), "New review request", "new"));
  if (typeof input.replacesId === "string") {
    await reviewRecordTarget(ctx, preview, applicationId, "review_request", input.replacesId);
    await cancelledAssignment(ctx, preview, applicationId, input.replacesId);
  }
};

export const cancelReviewPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input } = preview;
  const id = z.string().parse(input.id);
  await reviewRecordTarget(ctx, preview, applicationId, "review_request", id);
  await cancelledAssignment(ctx, preview, applicationId, id);
};

export const recordAssessmentPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input, targets } = preview;
  targets.push(target("assessment", z.string().parse(input.id), "New assessment", "new"));
  if (typeof input.requestId === "string") {
    await reviewRecordTarget(ctx, preview, applicationId, "review_request", input.requestId);
  }
  if (typeof input.previousId === "string") {
    await reviewRecordTarget(ctx, preview, applicationId, "assessment", input.previousId);
  }
};

export const correctAssessmentPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input } = preview;
  const version = await reviewRecordTarget(
    ctx,
    preview,
    applicationId,
    "assessment",
    z.string().parse(input.id),
  );
  if (typeof version === "number") {
    bindRevision(ctx, input, "expectedAssessmentVersion", version);
  }
};

export const recommendationPreview = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
) => {
  const { input } = preview;
  const selected = fields(input.expectedCurrentAssessment);
  if (typeof selected.id === "string") {
    const version = await reviewRecordTarget(
      ctx,
      preview,
      applicationId,
      "assessment",
      selected.id,
    );
    if (selected.version !== version) {
      throw new PreviewProblem("conflict");
    }
  }
};

/**
 * A run sends material to the model provider and saves a new record; the person approves both. The
 * approved action carries the identity of its run. Retrying the action repeats it, so a review that
 * already saved is returned, never run and saved a second time. The model never chooses it: one
 * copied from an earlier action would return that action's review.
 */
export const aiReviewPreview = (ctx: PreviewContext, preview: AssistantPreview) => {
  const provider = ctx.ops.reviews.aiReviewProvider;
  if (!provider) {
    throw new PreviewProblem("provider_unconfigured");
  }
  if (!ctx.stored || typeof preview.input.runId !== "string") {
    preview.input.runId = crypto.randomUUID();
  }
  preview.effects.push(
    `Sends this application's current material and the round's criteria to ${provider.provider} (${provider.model}).`,
    "Saves a new AI review.",
  );
};
