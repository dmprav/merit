import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";
import { z } from "zod";

import type { Call } from "../scenario";
import {
  checked,
  findApplication,
  findContact,
  findReview,
  reviewArgs,
  reviews,
  managerAssignment,
  manageAssignment,
  myAssignment,
  respond,
  writeReviewDraft,
  readContent,
} from "./client";

const application = "River Gardens";
const reviewer = "Priya Rao";
const reasoning = "Shared meals benefit the neighbourhood.";
const draft = { position: "Fund", amount: "200.50", reasoning, observations: [], note: "" };
const copy =
  "Priya, could you review River Gardens? Your assessment would help us make our decision.";

const send = async (
  call: Call,
  target: { workspaceSlug: string; applicationId: string },
  requestId: string,
) => {
  const saved = await checked(call, "invite_reviewer", {
    ...target,
    requestId,
    commandId: randomUUID(),
    dueDate: null,
  });
  assert(z.object({ delivery: z.string() }).parse(saved.assignment).delivery === "sent");
  return "I sent Priya the invitation to review River Gardens.";
};

export const track = (invite: boolean) => async (call: Call) => {
  const { contactId } = await findContact(call, reviewer);
  const target = await reviewArgs(call);
  const id = randomUUID();
  await checked(call, "request_review", { ...target, id, contactId, replacesId: null });
  if (invite) {
    return send(
      call,
      { applicationId: target.applicationId, workspaceSlug: target.workspaceSlug },
      id,
    );
  }
  return "I recorded Priya's outstanding review request. I left contacting her to you.";
};

export const sendExisting = async (call: Call) => {
  const target = await findApplication(call, application);
  const request = await findReview(call, target, "request", reviewer);
  return send(call, target, request.id);
};

export const draftCopy = async () => copy;

export const cancel = async (call: Call) => {
  const target = await reviewArgs(call);
  const { id } = await findReview(call, target, "request", reviewer);
  await checked(call, "cancel_review_request", { ...target, id });
  return "Cancelled Priya's outstanding request.";
};

export const overview = async (call: Call) =>
  (await reviews(call, await findApplication(call, application)))
    .map((row) =>
      row.kind === "request"
        ? row.reviewer + " has an outstanding request."
        : row.reviewer + "’s assessment is " + row.freshness + ".",
    )
    .join(" ");

export const recordPaper = async (call: Call) => {
  const args = await reviewArgs(call);
  const { id: requestId, contactId } = await findReview(call, args, "request", reviewer);
  await checked(call, "record_assessment", {
    ...args,
    id: randomUUID(),
    requestId,
    contactId,
    previousId: null,
    content: {
      applicationVersion: null,
      criteriaVersion: null,
      date: "2026-11-09",
      position: "Fund",
      amount: { minorUnits: "20050", currency: "EUR" },
      reasoning,
      observations: [],
    },
  });
  return "Recorded Priya's paper review with unknown evidence versions.";
};

export const correctPaper = async (call: Call) => {
  const args = await reviewArgs(call);
  const { id } = await findReview(call, args, "assessment", reviewer);
  const selected = await readContent(call, {
    workspaceSlug: args.workspaceSlug,
    applicationId: args.applicationId,
    section: "assessment",
    entryId: id,
  });
  const { versions } = z
    .object({ versions: z.array(z.object({ content: z.record(z.string(), z.unknown()) })) })
    .parse(JSON.parse(selected));
  const latest = versions.at(-1);
  assert(latest);
  await checked(call, "correct_assessment", {
    ...args,
    id,
    content: { ...latest.content, amount: { currency: "EUR", minorUnits: "21050" } },
    note: "Transcription error.",
  });
  return "Corrected the amount and retained the original version.";
};

export const invitationStatus = async (call: Call) => {
  const target = await findApplication(call, application);
  const rows = z
    .array(z.object({ reviewer: z.string(), delivery: z.string() }))
    .parse((await checked(call, "list_application_reviewers", target)).assignments);
  return rows
    .map((row) => row.reviewer + " was invited. Email delivery: " + row.delivery + ".")
    .join(" ");
};

export const invitationHistory = async (call: Call) => {
  const { expectedRevision: _, ...target } = await managerAssignment(call);
  const history = await checked(call, "list_reviewer_history", target);
  return z
    .array(z.object({ action: z.string(), at: z.string() }))
    .parse(history.entries)
    .filter((row) =>
      ["review_assignment.invited", "review_assignment.accepted"].includes(row.action),
    )
    .map((row) => "Priya was " + row.action.split(".")[1] + " on " + row.at.slice(0, 10) + ".")
    .join(" ");
};

export const manage =
  (action: string, reply: string, note = "") =>
  async (call: Call) => {
    await manageAssignment(call, action, note);
    return reply;
  };

export const listMine = async (call: Call) => {
  const rows = z
    .array(z.object({ applicationTitle: z.string(), status: z.string() }))
    .parse((await checked(call, "list_my_reviews", {})).assignments);
  return rows
    .filter((row) => row.status === "invited")
    .map((row) => row.applicationTitle + " is waiting for your response.")
    .join(" ");
};

export const assignedEvidence = async (call: Call) => {
  const { page } = await myAssignment(call);
  const data = z
    .object({
      assignment: z.object({ applicationVersion: z.number(), criteriaVersion: z.number() }),
      criteria: z.array(z.object({ title: z.string() })),
      material: z.object({ requested: z.object({ minorUnits: z.string() }) }),
    })
    .parse(page);
  return `Your assigned material is version ${data.assignment.applicationVersion}, requesting ${data.material.requested.minorUnits} cents. Criteria version ${data.assignment.criteriaVersion}: ${data.criteria.map((row) => row.title).join(", ")}.`;
};

export const response =
  (action: string, reply: string, note = "") =>
  async (call: Call) => {
    await respond(call, action, note);
    return reply;
  };

export const privateDraft = async (call: Call) => {
  await writeReviewDraft(call, draft);
  return "Saved the private draft.";
};

export const submit = async (call: Call) => {
  await writeReviewDraft(call);
  return "Submitted your saved assessment to the manager.";
};

export const complete = async (call: Call) => {
  await respond(call, "accept");
  await privateDraft(call);
  return submit(call);
};
