import { assert, expect, it, vi } from "vite-plus/test";

import { contactApplicationSummarySchema } from "@merit/grantmaking/api";

import type { GrantmakingOperations } from "./operations";
import { createGrantmakingTools } from "./tools";

it("lists contact-related applications using the signed-in actor's grantmaking query", async () => {
  const actor = { userId: "manager" };
  const input = { workspaceSlug: "alder", contactId: crypto.randomUUID(), limit: 10 };
  const application = contactApplicationSummarySchema.parse({
    applicationId: "0123456789ab",
    roundId: "0123456789ac",
    title: "Neighbour Table",
    roundTitle: "Community grants",
    relationships: ["applicant_contact"],
    applicationVersion: 1,
    intakeRevision: 0,
    reviewRevision: 0,
    recommendationRevision: 0,
    intakeStatus: "in_preparation",
    withdrawn: false,
    requested: null,
    contactId: input.contactId,
    hasWorkingRevision: false,
  });

  const listContactApplications: GrantmakingOperations["listContactApplications"] = async (
    caller,
    query,
  ) =>
    caller.userId === actor.userId && query.workspaceSlug === input.workspaceSlug
      ? {
          status: "ok",
          applications: [application]
            .filter((item) => item.contactId === query.contactId)
            .slice(0, query.limit),
          nextCursor: null,
        }
      : { status: "not_found" };

  const queries = {
    listContactApplications,
    listRoundSummaries: vi.fn(),
    readRound: vi.fn(),
    listApplications: vi.fn(),
    readApplication: vi.fn(),
    listReviews: vi.fn(),
    roundContent: vi.fn(),
    applicationContent: vi.fn(),
    roundHistory: vi.fn(),
    applicationHistory: vi.fn(),
    listWorkspaceActivity: vi.fn(),
    searchWorkspace: vi.fn(),
  };
  const tools = createGrantmakingTools(actor, queries, "https://merit.example");
  const related = tools.find((tool) => tool.name === "list_contact_applications");
  assert(related);
  expect(await related.execute(input)).toEqual({
    status: "ok",
    applications: [application],
    nextPage: null,
  });
});
