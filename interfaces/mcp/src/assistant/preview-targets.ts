import { z } from "zod";

import { fields, type AssistantPreview } from "./contracts";
import {
  applicationContent,
  bindRevision,
  PreviewProblem,
  readContact,
  target,
  type PreviewContext,
} from "./preview-records";

const revisionInputs = {
  intakeRevision: "expectedIntakeRevision",
  reviewRevision: "expectedReviewRevision",
  recommendationRevision: "expectedRecommendationRevision",
  decisionRevision: "expectedDecisionRevision",
} as const;

type ApplicationChanges = (
  ctx: PreviewContext,
  preview: AssistantPreview,
  applicationId: string,
  title: string,
) => Promise<void>;

export const application =
  (revision: keyof typeof revisionInputs | "context", changes?: ApplicationChanges) =>
  async (ctx: PreviewContext, preview: AssistantPreview) => {
    const { actor, ops, workspaceSlug } = ctx;
    const { input } = preview;
    const applicationId = z.string().parse(input.applicationId);
    const loaded = await ops.grantmaking.readApplication(actor, { workspaceSlug, applicationId });
    if (loaded.status !== "ok") {
      throw new PreviewProblem(loaded.status);
    }
    const app = loaded.application;
    if (
      (input.expectedApplicationVersion !== undefined &&
        input.expectedApplicationVersion !== app.applicationVersion) ||
      (input.expectedCriteriaVersion !== undefined &&
        input.expectedCriteriaVersion !== app.criteriaVersion)
    ) {
      throw new PreviewProblem("conflict");
    }
    const version = revision === "context" ? app.intakeRevision : app[revision];
    if (revision !== "context") {
      bindRevision(ctx, input, revisionInputs[revision], version);
    }
    preview.targets.push(target("application", applicationId, app.title, version));
    await changes?.(ctx, preview, applicationId, app.title);
  };

export const workingRevision: ApplicationChanges = async (ctx, preview, applicationId, title) => {
  const draft = await applicationContent(ctx, applicationId, "working_revision");
  if (draft.value == null) {
    throw new PreviewProblem("conflict");
  }
  preview.changes = { workingRevision: draft.value };
  preview.targets.push(target("working_revision", applicationId, title, draft.version));
};

export const round =
  (bindPreparation: boolean) => async (ctx: PreviewContext, preview: AssistantPreview) => {
    const { ops, actor, workspaceSlug } = ctx;
    const roundId = z.string().parse(preview.input.roundId);
    const current = await ops.grantmaking.readRound(actor, { workspaceSlug, roundId });
    if (current.status !== "ok") {
      throw new PreviewProblem(current.status);
    }
    const { title, preparationRevision } = current.round;
    preview.targets.push(target("round", current.round.roundId, title, preparationRevision));
    if (bindPreparation) {
      bindRevision(ctx, preview.input, "expectedPreparationRevision", preparationRevision);
    }
  };

export const proposed =
  (kind: "application" | "round") => (_ctx: PreviewContext, preview: AssistantPreview) => {
    preview.targets.push({
      kind,
      requestId: z.string().parse(preview.input.requestId),
      label: z.string().parse(preview.input.title),
      version: "proposed",
    });
  };

export const newContact = (_ctx: PreviewContext, preview: AssistantPreview) => {
  const { input } = preview;
  preview.targets.push(
    target(
      "contact",
      z.string().parse(input.contactId),
      z.string().parse(fields(input.details).name),
      "new",
    ),
  );
};

export const contact =
  (source: "contactId" | "change.contactId", bindContact = false) =>
  async (ctx: PreviewContext, preview: AssistantPreview) => {
    const { input } = preview;
    const id = source === "contactId" ? input.contactId : fields(input.change).contactId;
    if (typeof id === "string") {
      const current = await readContact(ctx, id);
      if (bindContact) {
        bindRevision(ctx, input, "expectedContactRevision", current.contactRevision);
      }
      preview.targets.push(target("contact", id, current.name, current.contactRevision));
    }
  };
