import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { encodeMoney } from "@merit/money";

import type { Scenario, ScenarioContext } from "../scenario";
import { content, lanterns, seedContact, seedRound, workspace } from "./application-fixture";
import * as client from "./client";
import * as controls from "./intake-controls";

const original = "2000.00";
const correction = {
  kind: "correction",
  reason: "Staff transcribed the amount incorrectly.",
  content: content("2500.00"),
};

export const revisions = async (
  ctx: ScenarioContext,
  action: "open" | "save" | "publish" | "discard" | "revise",
): Promise<Scenario> => {
  const app = await lanterns(ctx, original);
  await app.write("mark_application_ready");
  if (action === "revise") {
    await app.assessment(await seedContact(ctx), "150000", "Supports local families");
  }
  const initial = await app.read();
  if (action !== "open" && action !== "revise") {
    await app.write("start_application_revision", { kind: "correction" });
  }
  if (action === "discard" || action === "publish") {
    await app.write("save_application_revision", { draft: correction });
  }
  return {
    control:
      action === "revise"
        ? controls.reviseMaterial
        : action === "open"
          ? controls.intake("start_application_revision", "Opened a revision of Lanterns.", {
              kind: "revision",
            })
          : action === "save"
            ? controls.saveCorrection
            : action === "publish"
              ? controls.intake("publish_application_revision", "Published the correction.")
              : controls.intake("discard_application_revision", "Discarded the correction."),
    verifyEffects: async () => {
      const after = await app.read();
      expect(after.application.reviews.assessments).toEqual(
        initial.application.reviews.assessments,
      );
      const published = action === "publish" || action === "revise";
      expect(after.application.version).toBe(published ? 2 : 1);
      assert(after.application.requested);
      expect(encodeMoney(after.application.requested)).toEqual({
        minorUnits: published ? "250000" : "200000",
        currency: "EUR",
      });
      if (action === "save") {
        const draft = after.intake.workingRevision;
        assert(draft);
        expect(draft.kind).toBe("correction");
        expect(Number(draft.content.requested)).toBe(2500);
        expect(draft.reason).toEqual(expect.stringMatching(/transcri|incorrect|error|mistake/i));
      } else if (action === "open") {
        expect(after.intake.workingRevision).toMatchObject({ kind: "revision" });
      } else {
        expect(after.intake.workingRevision).toBeNull();
      }
      if (published) {
        const versions = await ctx.sql.query<Record<string, unknown>>(
          "SELECT version, requested_minor_units::text AS cents, reason FROM material_versions WHERE case_id=$1 ORDER BY version",
          [app.address.applicationId],
        );
        expect(versions.rows).toMatchObject([
          { version: 1, cents: "200000" },
          {
            version: 2,
            cents: "250000",
          },
        ]);
        expect(versions.rows[1]?.reason).toEqual(
          expect.stringMatching(/transcri|incorrect|error|mistake/i),
        );
      }
    },
  };
};

export const newApplication = async (ctx: ScenarioContext): Promise<Scenario> => {
  const roundId = await seedRound(ctx, "Community Arts");
  return {
    control: controls.newApplication,
    verifyEffects: async () => {
      const records = await ctx.sql.query<Record<string, unknown>>(
        "SELECT search_title,intake_status,requested_minor_units,round_id FROM application_cases c JOIN material_versions m ON m.case_id=c.id AND m.version=c.material_version WHERE c.organization_id='alder'",
      );
      expect(records.rows).toEqual([
        {
          search_title: "River Lights",
          intake_status: "in_preparation",
          requested_minor_units: null,
          round_id: roundId,
        },
      ]);
    },
  };
};

export const staffNote = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, original);

  await app.assessment(await seedContact(ctx), "150000", "Benefits local families");
  const initial = await app.read();
  const summary = "Applicant confirmed the venue by phone.";
  return {
    control: controls.intake("edit_application", "Saved the staff summary.", {
      change: { action: "details", summary },
    }),
    verifyEffects: async () => {
      const { application: record } = await app.read();
      expect(record.summary).toBe(summary);
      expect(record.version).toBe(initial.application.version);
      expect(record.submission).toEqual(initial.application.submission);
      expect(record.reviews).toEqual(initial.application.reviews);
    },
  };
};

export const applicantContact = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, original);

  const contactId = await seedContact(ctx, "Priya Rao", "priya@example.test");

  const profile = async () =>
    (
      await ctx.sql.query<Record<string, unknown>>("SELECT * FROM contacts WHERE id=$1", [
        contactId,
      ])
    ).rows;

  const initial = await profile();
  return {
    control: controls.selectApplicant,
    verifyEffects: async () => {
      expect((await app.read()).application.contactId).toBe(contactId);
      expect(await profile()).toEqual(initial);
    },
  };
};

export const readyForReview = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, original);
  return {
    control: controls.intake("mark_application_ready", "Lanterns is ready for review."),
    verifyEffects: async () => {
      const { application: record } = await app.read();
      expect(record).toMatchObject({ intakeStatus: "ready", reviews: { requests: [] } });
      expect(ctx.recipients).toEqual([]);
    },
  };
};

export const deleteDuplicate = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, original);

  const other = await ctx.createApplication("Duplicate Lanterns");
  return {
    control: controls.deleteDuplicate,
    verifyEffects: async () => {
      expect(
        (
          await ctx.sql.query<Record<string, unknown>>(
            "SELECT id FROM application_cases WHERE organization_id='alder'",
          )
        ).rows,
      ).toEqual([{ id: app.address.applicationId }]);
      expect(
        (
          await ctx.sql.query<Record<string, unknown>>(
            "SELECT action FROM audit_events WHERE action='application.deleted' AND target_id=$1",
            [other.publicId],
          )
        ).rowCount,
      ).toBe(1);
    },
  };
};

export const ambiguousWithdrawal = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, original);

  const roundId = await seedRound(ctx, "Community Arts");
  const other = await client.checked(ctx.seed, "create_application", {
    ...workspace,
    roundId,
    requestId: randomUUID(),
    title: "Lanterns",
  });
  const ids = [app.address.applicationId, z.string().parse(other.applicationId)];
  return {
    allowDiscovery: true,
    control: async (call) =>
      "Which Lanterns do you mean: " +
      (await client.search(call, "Lanterns")).applications.results
        .map((item) => item.roundTitle)
        .join(" or ") +
      "?",
    verifyEffects: async () => {
      const result = await ctx.sql.query<Record<string, unknown>>(
        "SELECT withdrawn_on,revision FROM application_cases WHERE id=ANY($1::text[])",
        [ids],
      );
      expect(result.rows).toEqual([
        { withdrawn_on: null, revision: 0 },
        { withdrawn_on: null, revision: 0 },
      ]);
    },
  };
};

export const withdrawal = async (ctx: ScenarioContext, reinstate: boolean): Promise<Scenario> => {
  const app = await lanterns(ctx, original);

  await app.write("mark_application_ready");
  await app.request(await seedContact(ctx));
  const withdrawal = { withdrawnOn: "2025-10-01", reason: "The venue closed." };
  if (reinstate) {
    await app.write("withdraw_application", withdrawal);
  }
  return {
    control: !reinstate
      ? controls.intake("withdraw_application", "Recorded the withdrawal.", withdrawal)
      : controls.intake("reinstate_application", "Reinstated Lanterns.", {
          reason: "The venue reopened.",
        }),
    verifyEffects: async () => {
      const page = await app.read();
      expect(page.application.reviews.requests).toMatchObject([
        { status: "cancelled", closedBy: { cause: "application_withdrawn" } },
      ]);
      if (!reinstate) {
        expect(page.application.withdrawal).toMatchObject({
          withdrawnOn: withdrawal.withdrawnOn,
        });
        expect(page.application.withdrawal?.reason).toEqual(expect.stringMatching(/venue.*clos/i));
      } else {
        expect(page.application.withdrawal).toBeUndefined();
        expect(page.application.intakeStatus).toBe("ready");
        expect(JSON.stringify(page.intake.history[0])).toEqual(expect.stringMatching(/reopen/i));
      }
    },
  };
};
