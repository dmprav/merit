import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { contactApplicationSummarySchema } from "@merit/grantmaking/api";

import {
  type Scenario,
  type ScenarioContext,
  successfulCalls,
  type ObservedCall,
} from "../scenario";
import { application, lanterns, seedContact, workspace } from "./application-fixture";
import * as client from "./client";
import * as controls from "./contact-controls";

const sam = { name: "Sam Reed", email: "sam@example.test", affiliation: "Review Panel" };
const jo = { name: "Jo Bell", email: "jo@example.test", affiliation: "Review Panel" };
const profileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  affiliation: z.string(),
  archived: z.boolean(),
  revision: z.number(),
});

const observedAssociations = (trace: readonly ObservedCall[], contactId: string) =>
  successfulCalls(trace, "list_contact_applications")
    .filter(
      (call) =>
        call.arguments?.workspaceSlug === workspace.workspaceSlug &&
        call.arguments.contactId === contactId,
    )
    .flatMap((call) =>
      z.array(contactApplicationSummarySchema).parse(call.outcome.content.applications),
    );

const profilesIn = async (ctx: ScenarioContext) =>
  profileSchema
    .array()
    .parse(
      (
        await ctx.sql.query<Record<string, unknown>>(
          "SELECT * FROM contacts WHERE organization_id='alder' ORDER BY name,id",
        )
      ).rows,
    );

export const archivedDirectory = async (ctx: ScenarioContext): Promise<Scenario> => {
  const names = Array.from(
    { length: 21 },
    (_, i) => `Panel member ${String(i + 1).padStart(2, "0")}`,
  );
  for (const [i, name] of names.entries()) {
    const contactId = await seedContact(ctx, name, `archived${i}@example.test`);
    await client.checked(ctx.seed, "archive_contact", {
      ...workspace,
      contactId,
      expectedContactRevision: 0,
    });
  }
  await seedContact(ctx);
  const initial = await profilesIn(ctx);
  return {
    control: async (call) =>
      z
        .array(z.object({ name: z.string() }))
        .parse(
          await client.pages(
            call,
            "list_contacts",
            { ...(await client.alderWorkspace(call)), archived: true },
            "contacts",
          ),
        )
        .map((row) => row.name)
        .join(", "),
    verifyTrace(trace) {
      const archived = successfulCalls(trace, "list_contacts").flatMap((call) =>
        z.array(z.object({ name: z.string() })).parse(call.outcome.content.contacts),
      );
      expect(archived.map((entry) => entry.name)).toEqual(expect.arrayContaining(names));
    },
    verifyReply(reply) {
      for (const name of names) {
        expect(reply.toLowerCase()).toContain(name.toLowerCase());
      }
      expect(reply).not.toMatch(/Jo Bell/i);
    },
    async verifyEffects() {
      expect(await profilesIn(ctx)).toEqual(initial);
    },
  };
};

export const ambiguousContact = async (ctx: ScenarioContext): Promise<Scenario> => {
  await seedContact(ctx, "Sam Reed", "sam.reed@example.test");
  await seedContact(ctx, "Sam Bell", "sam.bell@example.test");
  const initial = await profilesIn(ctx);
  return {
    allowDiscovery: true,
    control: controls.ambiguousSam,
    verifyEffects: async () => {
      expect(await profilesIn(ctx)).toEqual(initial);
    },
  };
};

export const newContact = async (ctx: ScenarioContext, link: boolean): Promise<Scenario> => {
  const app = link ? await lanterns(ctx) : null;
  if (app) {
    await app.assessment(await seedContact(ctx), "150000", "Community impact");
  }
  const reviews = app ? (await app.read()).application.reviews : null;
  const initial = await profilesIn(ctx);

  const members = async () =>
    (
      await ctx.sql.query<Record<string, unknown>>(
        "SELECT * FROM memberships WHERE organization_id='alder' ORDER BY user_id",
      )
    ).rows;

  const initialMembers = await members();
  return {
    control: controls.addSam(link),
    async verifyEffects() {
      const after = await profilesIn(ctx);
      expect(after).toHaveLength(initial.length + 1);
      expect(after).toEqual(expect.arrayContaining(initial));
      const added = after.filter((c) => c.email === sam.email);
      expect(added).toMatchObject([{ ...sam, archived: false }]);
      expect(await members()).toEqual(initialMembers);
      expect(ctx.recipients).toEqual([]);
      if (app) {
        const record = (await app.read()).application;
        expect(record.contactId).toBe(added[0]?.id);
        expect(record.reviews).toEqual(reviews);
      }
    },
    verifyTrace: app
      ? (trace) => {
          const index = trace.findIndex(
            (call) =>
              call.name === "select_application_contact" &&
              call.outcome.kind === "success" &&
              call.arguments?.workspaceSlug === workspace.workspaceSlug &&
              call.arguments.applicationId === app.address.applicationId,
          );
          const link = trace[index];
          assert(link, "Expected Sam to be linked to Lanterns");
          const linked = observedAssociations(
            trace.slice(index + 1),
            z.string().parse(link.arguments?.contactId),
          );
          const application = linked.find((row) => row.applicationId === app.address.applicationId);
          expect(
            application?.relationships,
            "Expected a workspace lookup for Sam after linking him",
          ).toContain("applicant_contact");
        }
      : undefined,
    verifyReply: app ? (reply) => expect(reply).toMatch(/Lanterns/i) : undefined,
  };
};

const joContact = async (ctx: ScenarioContext) => {
  const contactId = await seedContact(ctx);
  const address = { ...workspace, contactId };

  const profile = async () => (await profilesIn(ctx)).find((c) => c.id === contactId);

  return { contactId, address, profile };
};

export const contactProfile = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId } = await joContact(ctx);
  const initial = await profilesIn(ctx);
  const card = z.object({ contactId: z.literal(contactId), email: z.string() });

  const emailFrom = (result: Record<string, unknown>) => {
    if (result.status !== "ok") {
      return undefined;
    }
    const records = Array.isArray(result.contacts) ? result.contacts : [result.contact];
    for (const row of records) {
      const parsed = card.safeParse(row);
      if (parsed.success) {
        return parsed.data.email;
      }
    }
    return undefined;
  };

  return {
    control: async (call) => (await client.findContact(call, "Jo Bell")).email,
    async verifyEffects() {
      expect(await profilesIn(ctx)).toEqual(initial);
    },
    verifyReply(reply) {
      expect(reply.toLowerCase().match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/g)).toContain(jo.email);
    },
    verifyTrace(trace) {
      const lookups = [
        ...successfulCalls(trace, "list_contacts"),
        ...successfulCalls(trace, "get_contact"),
      ];
      expect(
        lookups.map((call) => emailFrom(call.outcome.content)),
        "Expected a contact lookup that returned Jo's email",
      ).toContain(jo.email);
    },
  };
};

export const restoreContact = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId, address, profile } = await joContact(ctx);
  await client.checked(ctx.seed, "archive_contact", { ...address, expectedContactRevision: 0 });
  return {
    control: controls.editJo("restore"),
    verifyEffects: async () => {
      expect(await profile()).toMatchObject({
        ...jo,
        id: contactId,
        archived: false,
        revision: 2,
      });
    },
  };
};

export const contactApplications = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId } = await joContact(ctx);
  const app = await lanterns(ctx);

  await app.write("select_application_contact", { contactId });
  const other = application(ctx, (await ctx.createApplication("Library Nights")).publicId);
  await other.assessment(contactId, "125000", "Creates shared learning opportunities");
  return {
    control: controls.associations,
    verifyTrace(trace) {
      expect(observedAssociations(trace, contactId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            applicationId: app.address.applicationId,
            relationships: ["applicant_contact"],
          }),
          expect.objectContaining({
            applicationId: other.address.applicationId,
            relationships: ["assessment_recorded"],
          }),
        ]),
      );
    },
    verifyReply(reply) {
      expect(reply).toMatch(/Lanterns/i);
      expect(reply).toMatch(/Library Nights/i);
      expect(reply).toMatch(/assess|review/i);
      expect(reply).toMatch(/applicant|contact/i);
    },
  };
};

export const changeContact = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId, profile } = await joContact(ctx);
  const app = await lanterns(ctx);

  await app.write("select_application_contact", { contactId });
  const revision = (await app.read()).intake.revision;
  const details = { ...jo, email: "jo.new@example.test" };
  return {
    control: controls.editJo("update"),
    verifyEffects: async () => {
      expect(await profile()).toMatchObject({ ...details, id: contactId, archived: false });
      const page = await app.read();
      expect(page.application.contactId).toBe(contactId);
      expect(page.intake.revision).toBe(revision);
    },
  };
};

export const archiveContact = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId, profile } = await joContact(ctx);
  const app = await lanterns(ctx);

  await app.assessment(contactId, "150000", "Community impact");
  const reviews = (await app.read()).application.reviews;
  return {
    control: controls.editJo("archive"),
    verifyEffects: async () => {
      expect(await profile()).toMatchObject({ ...jo, id: contactId, archived: true });
      expect((await app.read()).application.reviews).toEqual(reviews);
    },
  };
};

export const blockedArchive = async (ctx: ScenarioContext): Promise<Scenario> => {
  const { contactId, profile } = await joContact(ctx);
  const app = await lanterns(ctx);

  await app.request(contactId);
  return {
    acceptsError: (call) =>
      call.name === "archive_contact" &&
      call.arguments?.contactId === contactId &&
      call.outcome.kind === "error" &&
      call.outcome.content?.status === "invalid" &&
      call.outcome.content.error === "outstanding_requests",
    control: controls.editJo("archive"),
    async verifyEffects() {
      expect(await profile()).toMatchObject({ ...jo, archived: false, revision: 0 });
      expect((await app.read()).application.reviews.requests).toMatchObject([
        { contactId, status: "outstanding" },
      ]);
    },
    verifyReply(reply) {
      expect(reply).toMatch(/request|outstanding|review/i);
    },
  };
};
