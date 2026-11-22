import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";
import { z } from "zod";

import type { Call } from "../scenario";
import { alderWorkspace, checked, editIntake, findContact, pages } from "./client";

const sam = { name: "Sam Reed", email: "sam@example.test", affiliation: "Review Panel" };

export const addSam = (link: boolean) => async (call: Call) => {
  const workspace = await alderWorkspace(call);
  const contactId = randomUUID();
  await checked(call, "create_contact", { ...workspace, contactId, details: sam });
  if (!link) {
    return "Created the shared contact Sam Reed.";
  }
  await editIntake(call, "select_application_contact", { contactId });
  const rows = z
    .array(z.object({ title: z.string() }))
    .parse(
      await pages(call, "list_contact_applications", { ...workspace, contactId }, "applications"),
    );
  return (
    "Added Sam as the applicant contact. Linked applications: " +
    rows.map((row) => row.title).join(", ") +
    "."
  );
};

export const editJo = (action: "update" | "archive" | "restore") => async (call: Call) => {
  const { workspaceSlug, contactId, contactRevision, name, affiliation } = await findContact(
    call,
    "Jo Bell",
  );
  const address = { workspaceSlug, contactId, expectedContactRevision: contactRevision };
  if (action === "update") {
    await checked(call, "update_contact", {
      workspaceSlug,
      contactId,
      details: { name, affiliation, email: "jo.new@example.test" },
    });
    return "Updated Jo Bell’s email.";
  }
  const result = await call(action + "_contact", address);
  if (result.error === "outstanding_requests") {
    return "Jo cannot be archived while a review request is outstanding.";
  }
  assert(result.status === "ok");
  return action === "archive" ? "Archived Jo Bell." : "Jo Bell is active again.";
};

export const associations = async (call: Call) => {
  const { workspaceSlug, contactId } = await findContact(call, "Jo Bell");
  const rows = z
    .array(z.object({ title: z.string(), relationships: z.array(z.string()) }))
    .parse(
      await pages(call, "list_contact_applications", { workspaceSlug, contactId }, "applications"),
    );
  return rows
    .map((row) => row.title + ": " + row.relationships.join(", ").replaceAll("_", " "))
    .join("\n");
};

export const ambiguousSam = async (call: Call) => {
  const list = await pages(call, "list_contacts", await alderWorkspace(call), "contacts");
  const matches = z
    .array(z.object({ name: z.string() }))
    .parse(list)
    .filter((row) => row.name.startsWith("Sam "));
  return "Which Sam do you mean: " + matches.map((row) => row.name).join(" or ") + "?";
};
