import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { editFundingApplication } from "@merit/applications/server";
import { actor } from "@merit/organizations/testing/workspace";

import { applicationTest, noApplicationWork } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

const today = () => new Date().toISOString().slice(0, 10);

const withdrawal = (reason = "The applicant secured other funding.", withdrawnOn = today()) =>
  ({ action: "withdraw", withdrawnOn, reason }) as const;

const it = applicationTest.extend("scenario", async ({ db, applications }) => {
  const address = await applications.createApplication("Application to withdraw");

  const read = async (target = address) => {
    const state = await readPersistedApplication(db, target.publicId);
    assert.isDefined(state);
    return state;
  };

  const edit = async (change: IntakeChange, target = address, revision?: number) =>
    editFundingApplication(
      db,
      actor,
      {
        ...target,
        change,
        expectedRevision: revision ?? (await read(target)).revision,
      },
      noApplicationWork,
    );

  assert((await edit({ action: "mark_ready" })).status === "ok");
  return { address, read, edit };
});

it("keeps the intake state and the shared working revision exactly as they were", async ({
  scenario: s,
}) => {
  expect(await s.edit({ action: "start_revision", kind: "revision" })).toMatchObject({
    status: "ok",
  });
  const saved = await s.edit({
    action: "save_revision",
    draft: {
      kind: "revision",
      reason: "Clarify the venue",
      content: { title: "Retitled while withdrawn" },
    },
  });
  expect(saved).toMatchObject({ status: "ok" });
  const before = await s.read();

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  const withdrawn = await s.read();
  expect(withdrawn.workingRevision).toEqual(before.workingRevision);
  expect(withdrawn.application.intakeStatus).toBe(before.application.intakeStatus);
  expect(withdrawn.application.version).toBe(before.application.version);

  expect(await s.edit({ action: "reinstate", reason: "The applicant returned." })).toMatchObject({
    status: "ok",
  });
  const reinstated = await s.read();
  expect(reinstated.workingRevision).toEqual(before.workingRevision);
  expect(reinstated.application).not.toHaveProperty("withdrawal");
});

it("can withdraw an application that is still in preparation", async ({
  applications,
  scenario: s,
}) => {
  const preparing = await applications.createApplication("Still preparing");
  const page = await s.read(preparing);
  expect(page.application.intakeStatus).toBe("in_preparation");

  expect(await s.edit(withdrawal(), preparing)).toMatchObject({ status: "ok" });
  expect((await s.read(preparing)).application).toMatchObject({
    intakeStatus: "in_preparation",
    withdrawal: { reason: "The applicant secured other funding." },
  });
});

it("rejects a withdrawal at a stale intake revision without recording it", async ({
  scenario: s,
}) => {
  const before = await s.read();

  expect(await s.edit(withdrawal(), s.address, before.revision - 1)).toEqual({
    status: "conflict",
  });
  expect(await s.read()).toEqual(before);
});

it("rejects a blank withdrawal reason as an invalid request", async ({ scenario: s }) => {
  const before = await s.read();

  expect(await s.edit(withdrawal("   "))).toEqual({
    status: "invalid",
    error: "invalid_application",
  });
  expect(await s.read()).toEqual(before);
});

it("rejects a withdrawal dated after today on the server's clock", async ({ scenario: s }) => {
  const before = await s.read();
  // Later than the current date in every time zone.
  const future = new Date(Date.now() + 60 * 3_600_000).toISOString().slice(0, 10);

  expect(await s.edit(withdrawal("Too soon", future))).toEqual({
    status: "invalid",
    error: "withdrawal_date_in_future",
  });
  expect(await s.read()).toEqual(before);
});

it("records a later withdrawal as a new event instead of editing the earlier one", async ({
  scenario: s,
}) => {
  expect(await s.edit(withdrawal("Withdrew the first time."))).toMatchObject({ status: "ok" });
  expect(await s.edit({ action: "reinstate", reason: "The applicant returned." })).toMatchObject({
    status: "ok",
  });

  expect(await s.edit(withdrawal("Withdrew a second time."))).toMatchObject({ status: "ok" });
  expect(
    (await s.read()).history
      .filter((entry) => entry.action === "application.withdraw")
      .map((entry) => entry.details.reason),
  ).toEqual(["Withdrew a second time.", "Withdrew the first time."]);
});
