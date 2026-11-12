import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { recordAuditEvent } from "@merit/audit/server/record";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { applicationWork } from "@merit/grantmaking/server/integrations";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { actor } from "@merit/organizations/testing/workspace";

import { transportTest } from "./transport-test";

export const commandTest = transportTest.extend("commands", async ({ db, rounds, transport }) => {
  const { createApplication } = rounds;

  const invoke = async (name: string, args: Record<string, unknown>) =>
    (await transport.callMcp(actor.userId, args, name)).structuredContent;

  const applicationScenario = async () => {
    const address = await createApplication("Original project");

    const read = async () => {
      const page = await getFundingApplicationPage(db, actor, address);
      assert.isNotNull(page);
      return page;
    };

    const change = async (change: Parameters<typeof editFundingApplication>[2]["change"]) => {
      const result = await editFundingApplication(
        db,
        actor,
        {
          ...address,
          expectedRevision: (await read()).intake.revision,
          change,
        },
        applicationWork,
        recordAuditEvent,
      );
      assert(result.status === "ok", "Could not prepare intake for the MCP command");
    };

    const args = async () => ({
      workspaceSlug: "alder",
      applicationId: address.publicId,
      expectedIntakeRevision: (await read()).intake.revision,
    });

    return { address, read, change, args };
  };

  const revisionScenario = async () => {
    const scenario = await applicationScenario();
    await scenario.change({ action: "mark_ready" });
    await scenario.change({ action: "start_revision", kind: "correction" });
    return scenario;
  };

  const createContact = async () => {
    const contactId = randomUUID();
    const result = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug: "alder",
        contactId,
        action: "create",
        details: { name: "Sam", email: "sam@example.test", affiliation: "Review panel" },
      },
      fundingRoundContactUsage,
    );
    assert(result.status === "ok", "Could not prepare the MCP contact");
    return contactId;
  };

  return { invoke, applicationScenario, revisionScenario, createContact };
});
