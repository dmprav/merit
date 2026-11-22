import { randomUUID } from "node:crypto";

import type { Call } from "../scenario";
import { checked, editIntake, findRound, findContact } from "./client";

export const newApplication = async (call: Call) => {
  await checked(call, "create_application", {
    ...(await findRound(call, "Community Arts")),
    title: "River Lights",
    requestId: randomUUID(),
  });
  return "Recorded River Lights. The requested amount is unknown.";
};

export const intake =
  (tool: string, reply: string, fields: Record<string, unknown> = {}) =>
  async (call: Call) => {
    await editIntake(call, tool, fields);
    return reply;
  };

export const selectApplicant = async (call: Call) => {
  const { contactId } = await findContact(call, "Priya Rao");
  await editIntake(call, "select_application_contact", { contactId });
  return "Priya Rao is the contact for Lanterns.";
};

const correction = {
  kind: "correction",
  reason: "Staff transcribed the amount incorrectly.",
  content: { requested: "2500.00" },
};
export const saveCorrection = intake(
  "save_application_revision",
  "Saved the correction as a draft. The recorded amount remains €2,000.",
  { draft: correction },
);

export const reviseMaterial = async (call: Call) => {
  await editIntake(call, "start_application_revision", { kind: "correction" });
  await saveCorrection(call);
  await editIntake(call, "publish_application_revision");
  return "Published the €2,500 correction. Earlier evidence is preserved.";
};

export const deleteDuplicate = async (call: Call) => {
  await editIntake(call, "delete_application", {}, "Duplicate Lanterns");
  return "Deleted Duplicate Lanterns.";
};
