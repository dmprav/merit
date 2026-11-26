import { z } from "zod";

import type { WorkspaceToolName } from "../app/tools";
import { requiredAccess } from "./authority";
import { receipt, type AssistantDependency, type AssistantPreview } from "./contracts";
import { fields } from "./evidence";
import type { AssistantContext } from "./operations";
import {
  applicationContent,
  bindRevision,
  PreviewProblem,
  readContact,
  target,
  type PreviewContext,
} from "./preview-records";
import {
  aiReviewPreview,
  assignmentPreview,
  invitationPreview,
  withdrawalPreview,
  reviewChanges,
} from "./preview-reviews";

const applicationChanges = async (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
  title: string,
) => {
  const { name, targets } = preview;
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
  if (name === "run_ai_review") {
    aiReviewPreview(ctx, preview);
  }
  await reviewChanges(ctx, preview, applicationId);
};

type LoadedApplication = Extract<
  Awaited<ReturnType<AssistantContext["ops"]["grantmaking"]["readApplication"]>>,
  { status: "ok" }
>["application"];

/** The version a person approves against: the revision the write binds to, or for an AI review the material it reads. */
const targetVersion = ({ name, input }: AssistantPreview, app: LoadedApplication) => {
  if (name === "run_ai_review") {
    return `application version ${app.applicationVersion}`;
  }
  if (name === "save_recommendation") {
    return app.recommendationRevision;
  }
  return "expectedReviewRevision" in input ? app.reviewRevision : app.intakeRevision;
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
  targets.push(target("application", applicationId, app.title, targetVersion(preview, app)));
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
  if (name === "create_contact") {
    const id = z.string().parse(input.contactId);
    preview.targets.push(
      target("contact", id, z.string().parse(fields(input.details).name), "new"),
    );
  }
  if (name === "create_funding_round" || name === "create_application") {
    preview.targets.push({
      kind: name === "create_application" ? "application" : "round",
      requestId: z.string().parse(input.requestId),
      label: z.string().parse(input.title),
      version: "proposed",
    });
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
