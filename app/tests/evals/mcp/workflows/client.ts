import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { assert } from "vite-plus/test";
import { z } from "zod";

import { applicationContextSchema, workspaceSearchSchema } from "@merit/grantmaking/api";

import type { Call } from "../scenario";

export const checked = async (call: Call, name: string, args: Record<string, unknown>) => {
  const response = await call(name, args);
  assert(response.status === "ok", `Expected a successful ${name} response`);
  return response;
};

export const workspaces = async (call: Call) =>
  z
    .array(z.object({ slug: z.string(), name: z.string(), kind: z.string(), url: z.url() }))
    .parse(await pages(call, "list_workspaces", {}, "workspaces"));

export const alderWorkspace = async (call: Call) => {
  const listed = await workspaces(call);
  const selected = listed.find(({ name }) => name === "Alder Foundation");
  assert(selected, "Alder Foundation was not listed");
  return { workspaceSlug: selected.slug };
};

export const search = async (call: Call, query: string) => {
  const workspace = await alderWorkspace(call);
  const result = workspaceSearchSchema.parse(
    await checked(call, "search_workspace", { ...workspace, query }),
  );
  return { ...workspace, ...result };
};

export const findRound = async (call: Call, title: string) => {
  const { workspaceSlug, rounds } = await search(call, title);
  const matches = rounds.results.filter((row) => row.title === title);
  const [round] = matches;
  assert(round && matches.length === 1, `Expected one round named ${title}`);
  return { workspaceSlug, roundId: round.id };
};

export const findApplication = async (call: Call, title: string) => {
  const { workspaceSlug, applications } = await search(call, title);
  const matches = applications.results.filter((row) => row.title === title);
  const [application] = matches;
  assert(application && matches.length === 1, `Expected one application named ${title}`);
  return { workspaceSlug, applicationId: application.id };
};

export const readApplication = async (
  call: Call,
  target: { workspaceSlug: string; applicationId: string },
) => applicationContextSchema.parse((await checked(call, "get_application", target)).application);

export const editIntake = async (
  call: Call,
  name: string,
  fields: Record<string, unknown> = {},
  title = "Lanterns",
) => {
  const target = await findApplication(call, title);
  const { intakeRevision } = await readApplication(call, target);
  return checked(call, name, { ...target, expectedIntakeRevision: intakeRevision, ...fields });
};

export const findContact = async (call: Call, name: string) => {
  const workspace = await alderWorkspace(call);
  const list = await pages(call, "list_contacts", workspace, "contacts");
  const contacts = z
    .array(
      z.object({
        contactId: z.uuid(),
        name: z.string(),
        affiliation: z.string(),
        email: z.string(),
        contactRevision: z.number(),
      }),
    )
    .parse(list);
  const matches = contacts.filter((item) => item.name === name);
  const [row] = matches;
  assert(row && matches.length === 1, `Expected one contact named ${name}`);
  return { ...workspace, ...row };
};

export const reviewArgs = async (call: Call) => {
  const target = await findApplication(call, "River Gardens");
  const app = await readApplication(call, target);
  return {
    ...target,
    expectedReviewRevision: app.reviewRevision,
    expectedCriteriaVersion: app.criteriaVersion,
    expectedApplicationVersion: app.applicationVersion,
  };
};

export const reviews = async (
  call: Call,
  target: { workspaceSlug: string; applicationId: string },
) =>
  z
    .array(
      z.object({
        id: z.string(),
        contactId: z.string(),
        reviewer: z.string(),
        kind: z.string(),
        freshness: z.string(),
        assessmentVersion: z.number().nullable(),
      }),
    )
    .parse(
      await pages(
        call,
        "list_application_reviews",
        { workspaceSlug: target.workspaceSlug, applicationId: target.applicationId },
        "reviews",
      ),
    );

export const findReview = async (
  call: Call,
  target: { workspaceSlug: string; applicationId: string },
  kind: "request" | "assessment",
  name: string,
) => {
  const matches = (await reviews(call, target)).filter(
    (row) => row.kind === kind && row.reviewer === name,
  );
  const [match] = matches;
  assert(match && matches.length === 1, `Expected one ${kind} for ${name}`);
  return match;
};

export const managerAssignment = async (call: Call) => {
  const target = await findApplication(call, "River Gardens");
  const assignments = z
    .array(z.object({ id: z.uuid(), revision: z.number(), reviewer: z.string() }))
    .parse(await pages(call, "list_application_reviewers", target, "assignments"));
  const assigned = assignments.find((row) => row.reviewer === "Priya Rao");
  assert(assigned, "Priya's assignment was not listed");
  return { ...target, assignmentId: assigned.id, expectedRevision: assigned.revision };
};

export const manageAssignment = async (call: Call, action: string, note = "") =>
  checked(call, "manage_reviewer_assignment", {
    ...(await managerAssignment(call)),
    commandId: randomUUID(),
    action,
    note,
  });

export const myAssignment = async (call: Call) => {
  const listed = await pages(call, "list_my_reviews", {}, "assignments");
  const assignments = z
    .array(z.object({ id: z.uuid(), applicationTitle: z.string(), workspaceSlug: z.string() }))
    .parse(listed);
  const item = assignments.find((row) => row.applicationTitle === "River Gardens");
  assert(item, "River Gardens was not listed");
  const target = { workspaceSlug: item.workspaceSlug, assignmentId: item.id };
  const page = await checked(call, "get_reviewer_assignment", target);
  return { target, page };
};

export const respond = async (call: Call, action: string, note = "") => {
  const { target, page } = await myAssignment(call);
  const assignment = z.object({ revision: z.number() }).parse(page.assignment);
  return checked(call, "respond_to_review", {
    ...target,
    commandId: randomUUID(),
    expectedRevision: assignment.revision,
    action,
    note,
  });
};

export const writeReviewDraft = async (call: Call, draft?: Record<string, unknown>) => {
  const { target, page } = await myAssignment(call);
  const revision = z.object({ revision: z.number() }).parse(page.draft).revision;
  const args = { ...target, commandId: randomUUID(), expectedDraftRevision: revision };
  return draft
    ? checked(call, "save_reviewer_draft", { ...args, draft })
    : checked(call, "submit_reviewer_assessment", args);
};

export const readContent = async (call: Call, args: Record<string, unknown>) => {
  let collected = "";
  let offset = 0;
  let fingerprint: string | undefined;
  for (;;) {
    const result = await checked(call, "get_application_content", {
      ...args,
      offset,
      ...(fingerprint && { fingerprint }),
    });
    const chunk = z
      .object({ content: z.string(), nextOffset: z.number().nullable(), fingerprint: z.string() })
      .parse(result);
    collected += chunk.content;
    if (chunk.nextOffset === null) {
      return collected;
    }
    assert(chunk.nextOffset > offset, "MCP content cursor did not advance");
    offset = chunk.nextOffset;
    fingerprint = chunk.fingerprint;
  }
};

export const pages = async (
  call: Call,
  name: string,
  start: Record<string, unknown>,
  field: string,
) => {
  const values: unknown[] = [];
  let input: Record<string, unknown> | null = start;
  const requests: Record<string, unknown>[] = [];
  while (input) {
    assert(
      !requests.some((previous) => isDeepStrictEqual(previous, input)),
      `Repeated page request for ${name}`,
    );
    requests.push(input);
    const result = await checked(call, name, input);
    values.push(...z.array(z.unknown()).parse(result[field]));
    input = z.record(z.string(), z.unknown()).nullable().parse(result.nextPage);
  }
  return values;
};
