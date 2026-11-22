import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { contentChunkSchema } from "@merit/grantmaking/api";

import { type Scenario, type ScenarioContext, successfulCalls } from "../scenario";
import { application, content, lanterns, seedRound, workspace } from "./application-fixture";
import * as client from "./client";
import * as controls from "./grant-controls";

export const allApplications = async (ctx: ScenarioContext): Promise<Scenario> => {
  const roundId = await seedRound(ctx, "Community Arts");
  const projects = Array.from(
    { length: 21 },
    (_, n) => `Arts project ${String(n + 1).padStart(2, "0")}`,
  );
  for (const title of projects) {
    await client.checked(ctx.seed, "create_application", {
      ...workspace,
      roundId,
      title,
      requestId: randomUUID(),
    });
  }
  const other = "Park restoration";
  await ctx.createApplication(other);
  return {
    control: async (call) =>
      controls.listTitles(
        call,
        "list_applications",
        await client.findRound(call, "Community Arts"),
        "applications",
      ),
    verifyReply(reply) {
      for (const title of projects) {
        expect(reply.toLowerCase().split(title.toLowerCase())).toHaveLength(2);
      }
      expect(reply.toLowerCase()).not.toContain(other.toLowerCase());
    },
  };
};

export const originalEvidence = async (
  ctx: ScenarioContext,
  titleOnly: boolean,
): Promise<Scenario> => {
  const sentence = "We will deliver four lantern-making workshops.";
  const firstAnswer = content(
    "2000",
    "Community sessions involve families. ".repeat(240) + sentence,
  );
  const created = await client.checked(ctx.seed, "create_application", {
    ...workspace,
    roundId: ctx.roundId,
    requestId: randomUUID(),
    ...(titleOnly ? { title: "Lanterns" } : firstAnswer),
  });
  const app = application(ctx, z.string().parse(created.applicationId));
  if (titleOnly) {
    await app.write("edit_application", {
      change: { action: "save_content", content: firstAnswer },
    });
  }
  await app.write("edit_application", {
    change: {
      action: "save_content",
      content: content("2000", "We will deliver six lantern-making workshops."),
    },
  });
  return {
    control: controls.quoteEvidence,
    verifyTrace(trace) {
      // A quote or its source may straddle two chunks. Mark unread characters explicitly.
      let seen: string[] = [];
      for (const call of successfulCalls(trace, "get_application_content")) {
        const args = call.arguments;
        if (
          args?.applicationId !== app.address.applicationId ||
          args.workspaceSlug !== app.address.workspaceSlug ||
          args.section !== "material" ||
          args.materialVersion !== (titleOnly ? 2 : 1)
        ) {
          continue;
        }
        const chunk = contentChunkSchema.parse(call.outcome.content);
        if (!seen.length) {
          seen = Array<string>(chunk.totalCharacters).fill("\u0000");
        }
        Array.from(chunk.content).forEach((char, index) => {
          seen[chunk.offset + index] = char;
        });
      }
      const visible = seen.join("");
      expect(visible, "Read the original recorded passage").toContain(sentence);
      expect(visible, "Read the historical source").toContain('"recorded_external"');
    },
    verifyReply(reply) {
      expect(reply.toLowerCase()).toContain(sentence.toLowerCase().replace(/\.$/, ""));
    },
  };
};

export const intakeChanges = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx);
  await app.write("edit_application", {
    change: { action: "details", summary: "Applicant confirmed the venue." },
  });
  await app.write("edit_application", {
    change: { action: "save_content", content: content("2400") },
  });
  return {
    control: async (call) => {
      const result = await client.checked(call, "list_application_history", {
        ...(await client.findApplication(call, "Lanterns")),
        history: "intake",
      });
      const entries = z.array(z.object({ action: z.string() })).parse(result.entries);
      expect(entries.map((entry) => entry.action)).toEqual([
        "application.created",
        "application.summary_changed",
        "application.material_changed",
      ]);
      return "Application created, then staff changed the summary, then updated the recorded material.";
    },
    verifyReply(reply) {
      const summary = /\bsummary\b/i.exec(reply);
      assert(summary, "Report the summary edit");
      // The creation entry may also mention the original requested amount.
      expect(
        reply.slice(summary.index + summary[0].length),
        "Report the later material edit after the summary edit",
      ).toMatch(/material|amount|request|submission|content|€2,?400/i);
    },
  };
};

export const currentMaterial = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx);
  await app.write("edit_application", {
    change: { action: "save_content", content: content("2400") },
  });
  await app.write("mark_application_ready");
  await app.write("start_application_revision", { kind: "revision" });
  return {
    control: controls.material,
    verifyReply(reply) {
      const text = reply.replace(/[*_`]/g, "");
      expect(text).toMatch(/\bready\b/i);
      expect(text, "The current submission is ready").not.toMatch(
        /\b(?:not|never|isn['’]t)(?:\s+(?:yet|currently|marked|actually))*\s+ready\b/i,
      );
      expect(text).toMatch(/\b(2|two|second|v2)\b/i);
    },
  };
};
