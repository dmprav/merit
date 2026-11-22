import { randomUUID } from "node:crypto";

import { expect } from "vite-plus/test";
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
    manualReplyCriterion:
      "Check that the summary edit precedes the material edit in the chronology described.",
    verifyReply(reply) {
      const summary = /\bsummary\b/i;
      const material = /\b(?:material|amount|request|submission|content)\b|€2,?400/i;
      expect(reply).toMatch(summary);
      expect(reply).toMatch(material);
      // Reject an explicit reversed sequence; wording and order of mention alone are inconclusive.
      for (const sentence of reply.split(/[.!?;\n]/)) {
        const clauses = sentence.split(/\b(then|before|after|followed by)\b/i);
        for (let i = 1; i < clauses.length; i += 2) {
          const left = clauses[i - 1] ?? "";
          const right = clauses[i + 1] ?? "";
          const [earlier, later] =
            clauses[i]?.toLowerCase() === "after" ? [right, left] : [left, right];
          expect(
            material.test(earlier) && !summary.test(earlier) && summary.test(later),
            "The material edit was described before the summary edit",
          ).toBe(false);
        }
      }
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
      const submission = text
        .split(/[.!?;,\n]|\b(?:but|whereas|while|and)\b/i)
        .flatMap((clause) =>
          Array.from(clause.matchAll(/\bready\b/gi), (match) =>
            clause.slice(0, match.index + match[0].length),
          ),
        )
        .filter((statement) => {
          const subjects = statement.matchAll(
            /\b(draft|(?:open|working|unpublished) revision)|\b(?:current|recorded) (?:submission|application|version)\b/gi,
          );
          return !Array.from(subjects).at(-1)?.[1];
        })
        .join(" ");
      expect(submission).toMatch(/\bready\b/i);
      expect(submission, "The current submission is ready").not.toMatch(
        /\b(?:not|never|isn['’]t)(?:\s+(?:yet|currently|marked|actually))*\s+ready\b/i,
      );
      expect(text).toMatch(/\b(2|two|second|v2)\b/i);
    },
  };
};
