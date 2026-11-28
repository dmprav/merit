import { createHash } from "node:crypto";

import { z } from "zod";

import type { WorkspaceToolName } from "../app/tools";
import { activeAssignment, requiredAccess } from "./authority";
import type { AssistantCitation, AssistantDependency, AssistantReceipt } from "./contracts";

const object = z.record(z.string(), z.unknown());

export const fields = (value: unknown) => object.safeParse(value).data ?? {};

const objects = (value: unknown) => z.array(object).safeParse(value).data ?? [];

const itemOrList = (one: unknown, many: unknown) => (one == null ? objects(many) : [fields(one)]);

// JSONB does not preserve object-key order. Arrays retain their domain ordering.
const snapshot = (value: unknown) => {
  const json = JSON.stringify(value, (_key, child: unknown) => {
    if (child === null || typeof child !== "object" || Array.isArray(child)) {
      return child;
    }
    const record = fields(child);
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
  return createHash("sha256").update(json).digest("hex");
};

type Cite = (kind: unknown, id: unknown, version: unknown, label: unknown) => void;

type Result = AssistantReceipt["result"];

const assignedEvidence = (
  result: Result,
  receipt: AssistantReceipt,
  reviewer: boolean,
  cite: Cite,
) => {
  for (const row of itemOrList(result.assignment, result.assignments)) {
    if (reviewer && typeof row.id === "string") {
      // Summaries include evidence comparisons even when the model cites nothing.
      receipt.dependencies.push({
        kind: "assignment",
        assignmentId: row.id,
        evidence:
          result.material != null || fields(row.basisComparison).applicationVersion !== "unknown",
        ...(activeAssignment(row.status) && { active: true }),
      });
    }
    cite("assignment", row.id, row.revision, row.applicationTitle);
    if (result.material != null) {
      cite("assigned_material", row.id, row.applicationVersion, row.applicationTitle);
    }
    if (result.criteria != null) {
      cite("assigned_criteria", row.id, row.criteriaVersion, row.applicationTitle);
    }
    if (result.draft != null) {
      cite("reviewer_draft", row.id, fields(result.draft).revision, row.applicationTitle);
    }
    if (result.assessment != null) {
      const assessment = fields(result.assessment);
      cite("assessment", assessment.id, objects(assessment.versions).length, row.reviewer);
    }
  }
};

const recordEvidence = (result: Result, cite: Cite) => {
  for (const app of itemOrList(result.application, result.applications)) {
    cite("application", app.applicationId, app.intakeRevision, app.title);
    cite("material", app.applicationId, app.applicationVersion, app.title);
  }
  for (const row of itemOrList(result.round, result.rounds)) {
    cite("round", row.roundId, row.preparationRevision, row.title);
  }
  for (const row of itemOrList(result.contact, result.contacts)) {
    cite("contact", row.contactId, row.contactRevision, row.name);
  }
  // An AI review is Merit AI's interpretation. It is never cited as application material.
  for (const row of itemOrList(result.aiReview, result.aiReviews)) {
    cite("ai_review", row.id, row.applicationVersion, `AI review (${String(row.model)})`);
  }
  for (const row of objects(result.reviews)) {
    cite(row.kind, row.id, row.assessmentVersion ?? row.reviewRevision, row.reviewer);
  }
  for (const row of objects(result.members)) {
    cite("member", row.membershipId, row.version, row.name);
  }
  for (const row of objects(result.workspaces)) {
    cite("workspace", row.id, snapshot(row), row.name);
  }
  for (const row of objects(fields(result.rounds).results)) {
    cite("round_search", row.id, snapshot(row), row.title);
  }
  for (const row of objects(fields(result.applications).results)) {
    cite("application_search", row.id, snapshot(row), row.title);
  }
};

const contentEvidence = (input: Record<string, unknown>, result: Result, cite: Cite) => {
  if (typeof result.fingerprint !== "string") {
    return;
  }
  const { section } = input;
  const recordId =
    section === "assessment" || section === "review_request"
      ? input.entryId
      : (input.applicationId ?? input.roundId);
  let version: unknown = result.fingerprint;
  if (section === "material") {
    version = input.materialVersion;
  }
  if (section === "criteria") {
    version = input.criteriaVersion ?? version;
  }
  if (
    section === "intake_change" ||
    section === "preparation_change" ||
    section === "recommendation_change"
  ) {
    version = input.revision;
  }
  cite(section, recordId, version, section);
};

export const describeResult = (
  name: WorkspaceToolName,
  input: Record<string, unknown>,
  result: Result,
): AssistantReceipt => {
  const access = requiredAccess(name);
  const dependencies: AssistantDependency[] = [{ kind: access }];
  const citations: AssistantCitation[] = [];
  const receipt = { result, dependencies, citations };

  const cite: Cite = (kind, id, version, label) => {
    if (
      typeof kind === "string" &&
      typeof id === "string" &&
      (typeof version === "number" || typeof version === "string")
    ) {
      citations.push({
        kind,
        recordId: id,
        version: String(version),
        label: typeof label === "string" ? label : id,
      });
    }
  };

  // Current financial totals, relationships, search matches and basis comparisons
  // may advance independently of the displayed owner's revision.
  if (
    result.status === "ok" &&
    !result.fingerprint &&
    (name.startsWith("list_") || name.startsWith("get_") || name === "search_workspace")
  ) {
    const id =
      input.assignmentId ??
      input.applicationId ??
      input.roundId ??
      input.contactId ??
      input.workspaceSlug;
    cite(
      "observation",
      id,
      snapshot({ name, input, result }),
      name.replaceAll("_", " ") + " (observed result)",
    );
  }
  assignedEvidence(result, receipt, access === "reviewer", cite);
  recordEvidence(result, cite);
  contentEvidence(input, result, cite);
  for (const row of objects(result.entries)) {
    if (name === "list_workspace_activity") {
      cite("activity", row.id, row.recordedAt, row.action);
    } else if (name === "list_reviewer_history") {
      cite("reviewer_event", input.assignmentId, snapshot(row), row.action);
    } else {
      cite(
        input.history ?? "round_preparation",
        input.applicationId ?? input.roundId,
        row.revision,
        row.action,
      );
    }
  }
  if (result.status === "ok" && !citations.length) {
    // Empty pages and aggregates can support a claim too. Pin the saved observation.
    cite(
      name,
      input.assignmentId ?? input.applicationId ?? input.roundId ?? input.workspaceSlug,
      snapshot({ input, result }),
      name,
    );
  }
  return receipt;
};
