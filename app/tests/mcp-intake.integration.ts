import { expect } from "vite-plus/test";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";

import { commandTest as it } from "./fixtures/mcp-command-test";

const draft = {
  kind: "correction" as const,
  reason: "Correct the requested amount",
  content: {
    title: "Corrected project",
    applicant: "Neighbours",
    requested: "250.50",
    answers: [
      {
        questionId: "e475d643-f254-5703-8f05-ad77691f9740",
        question: "Purpose",
        response: "Weekly shared meals",
      },
    ],
  },
};

it.for(["correction", "revision"] as const)(
  "starts a %s against the caller's intake revision",
  async (kind, { commands: { invoke, applicationScenario } }) => {
    const scenario = await applicationScenario();
    await scenario.change({ action: "mark_ready" });
    const args = await scenario.args();

    expect(await invoke("start_application_revision", { ...args, kind })).toEqual({
      status: "ok",
      applicationId: args.applicationId,
      intakeRevision: args.expectedIntakeRevision + 1,
    });
    expect((await scenario.read()).intake.workingRevision).toMatchObject({ kind });
  },
);

it("saves revision content without publishing it", async ({
  commands: { invoke, revisionScenario, createContact },
}) => {
  const scenario = await revisionScenario();
  const before = await scenario.read();
  const args = await scenario.args();
  const contactId = await createContact();

  expect(await invoke("save_application_revision", { ...args, draft, contactId })).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    intakeRevision: args.expectedIntakeRevision + 1,
  });
  const saved = await scenario.read();
  expect(saved.application).toMatchObject({
    title: before.application.title,
    version: before.application.version,
    contactId,
    submission: { contact: "Sam", contactEmail: "sam@example.test" },
  });
  expect(encodeMoney(saved.application.requested!)).toEqual(
    encodeMoney(before.application.requested!),
  );
  expect(saved.intake.workingRevision).toEqual(draft);
});

it.for(["publish", "discard"] as const)(
  "%s resolves the working revision through MCP",
  async (action, { commands: { invoke, revisionScenario } }) => {
    const scenario = await revisionScenario();
    await scenario.change({ action: "save_revision", draft });
    const before = await scenario.read();
    const args = await scenario.args();

    expect(await invoke(`${action}_application_revision`, args)).toEqual({
      status: "ok",
      applicationId: args.applicationId,
      intakeRevision: args.expectedIntakeRevision + 1,
    });
    const saved = await scenario.read();
    expect(saved.intake.workingRevision).toBeNull();
    if (action === "publish") {
      expect(saved.application).toMatchObject({
        title: draft.content.title,
        version: before.application.version + 1,
      });
      expect(encodeMoney(saved.application.requested!)).toEqual({
        minorUnits: "25050",
        currency: "EUR",
      });
    } else {
      expect(saved.application).toEqual(before.application);
    }
  },
);

it("marks complete intake ready", async ({ commands: { invoke, applicationScenario } }) => {
  const scenario = await applicationScenario();
  const args = await scenario.args();

  expect(await invoke("mark_application_ready", args)).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    intakeRevision: args.expectedIntakeRevision + 1,
  });
  expect((await scenario.read()).application.intakeStatus).toBe("ready");
});

it("deletes unused preparation", async ({ db, commands: { invoke, applicationScenario } }) => {
  const scenario = await applicationScenario();
  const args = await scenario.args();

  expect(await invoke("delete_application", args)).toMatchObject({
    status: "ok",
    applicationId: args.applicationId,
  });
  expect(await getFundingApplicationPage(db, actor, scenario.address)).toBeNull();
});

it("withdraws an application with the caller's revision and authenticated author", async ({
  commands: { invoke, applicationScenario },
}) => {
  const scenario = await applicationScenario();
  await scenario.change({ action: "mark_ready" });
  const args = await scenario.args();

  expect(
    await invoke("withdraw_application", {
      ...args,
      withdrawnOn: "2020-01-15",
      reason: "The applicant found other funding.",
    }),
  ).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    intakeRevision: args.expectedIntakeRevision + 1,
  });
  const withdrawn = await scenario.read();
  expect(withdrawn.application).toMatchObject({
    intakeStatus: "ready",
    withdrawal: {
      withdrawnOn: "2020-01-15",
      reason: "The applicant found other funding.",
      recorder: { name: "Dana Reed" },
    },
  });
  expect(withdrawn.intake.history[0]).toMatchObject({
    action: "application.withdraw",
    provenance: { interface: "mcp", clientId: "integration-client" },
  });
});

it("reinstates a withdrawn application against the caller's intake revision", async ({
  commands: { invoke, applicationScenario },
}) => {
  const scenario = await applicationScenario();
  await scenario.change({ action: "mark_ready" });
  await scenario.change({ action: "withdraw", withdrawnOn: "2020-01-15", reason: "Stepped back" });
  const args = await scenario.args();

  expect(
    await invoke("reinstate_application", { ...args, reason: "The applicant returned." }),
  ).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    intakeRevision: args.expectedIntakeRevision + 1,
  });
  const reinstated = await scenario.read();
  expect(reinstated.application).not.toHaveProperty("withdrawal");
  expect(reinstated.intake.history[0]).toMatchObject({
    action: "application.reinstate",
    provenance: { interface: "mcp", clientId: "integration-client" },
  });
});

it("rejects a withdrawal using a stale intake revision without recording it", async ({
  commands: { invoke, applicationScenario },
}) => {
  const scenario = await applicationScenario();
  const stale = await scenario.args();
  await scenario.change({ action: "details", summary: "A colleague's summary" });
  const before = await scenario.read();

  expect(
    await invoke("withdraw_application", {
      ...stale,
      withdrawnOn: "2020-01-15",
      reason: "Stepped back",
    }),
  ).toEqual({ status: "conflict" });
  expect(await scenario.read()).toEqual(before);
});

it("returns a rejected withdrawal as the operation's typed invalid result", async ({
  commands: { invoke, applicationScenario },
}) => {
  const scenario = await applicationScenario();

  expect(
    await invoke("withdraw_application", {
      ...(await scenario.args()),
      withdrawnOn: "9999-12-31",
      reason: "Stepped back",
    }),
  ).toEqual({ status: "invalid", error: "withdrawal_date_in_future" });
  expect((await scenario.read()).application).not.toHaveProperty("withdrawal");
});

it.for([
  {
    action: "save_content",
    change: {
      action: "save_content",
      content: {
        title: "Renamed project",
        applicant: "Neighbours",
        requested: "250.50",
        answers: [
          {
            questionId: "e475d643-f254-5703-8f05-ad77691f9740",
            question: "Purpose",
            response: "Weekly shared meals",
          },
        ],
      },
    },
    expected: {
      title: "Renamed project",
      version: 2,
      submission: {
        organization: "Neighbours",
        answers: [
          {
            questionId: "e475d643-f254-5703-8f05-ad77691f9740",
            question: "Purpose",
            response: "Weekly shared meals",
          },
        ],
      },
    },
  },
  {
    action: "details",
    change: { action: "details", summary: "Staff assessment" },
    expected: { summary: "Staff assessment", version: 1 },
  },
] as const)(
  "persists ordinary intake $action with the authenticated author",
  async ({ change, expected }, { commands: { invoke, applicationScenario, createContact } }) => {
    const scenario = await applicationScenario();
    const args = await scenario.args();
    const contactId = change.action === "save_content" ? await createContact() : undefined;
    const input = change.action === "save_content" ? { ...change, contactId } : change;

    expect(await invoke("edit_application", { ...args, change: input })).toEqual({
      status: "ok",
      applicationId: args.applicationId,
      intakeRevision: args.expectedIntakeRevision + 1,
    });
    const saved = await scenario.read();
    expect(saved.application).toMatchObject(expected);
    if (change.action === "save_content") {
      expect(saved.application.contactId).toBe(contactId);
      expect(encodeMoney(saved.application.requested!)).toEqual({
        minorUnits: "25050",
        currency: "EUR",
      });
    }
    expect(saved.intake.history[0]).toMatchObject({
      actor: "Dana Reed",
      provenance: { interface: "mcp", clientId: "integration-client" },
    });
  },
);

it("applies stale-revision staff summary details and rejects stale content edits", async ({
  commands: { invoke, applicationScenario },
}) => {
  const scenario = await applicationScenario();
  const stale = await scenario.args();
  await scenario.change({ action: "details", summary: "A colleague's summary" });
  const beforeContent = await scenario.read();

  expect(
    await invoke("edit_application", {
      ...stale,
      change: {
        action: "save_content",
        content: {
          title: "Stale overwrite",
          applicant: "Neighbours",
          requested: "250.50",
          answers: beforeContent.application.submission?.answers ?? [],
        },
      },
    }),
  ).toEqual({ status: "conflict" });
  expect(await scenario.read()).toEqual(beforeContent);

  expect(
    await invoke("edit_application", {
      ...stale,
      change: { action: "details", summary: "Latest staff summary" },
    }),
  ).toEqual({
    status: "ok",
    applicationId: stale.applicationId,
    intakeRevision: stale.expectedIntakeRevision + 2,
  });
  expect((await scenario.read()).application.summary).toBe("Latest staff summary");
});
