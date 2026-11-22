import { assert, expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";
import { gradeSelection } from "../tool-selection";
import { editIntake, findContact } from "./client";

catalogTest(
  "accepts either contact read when it supplies Jo's email",
  async ({ catalog, database }) => {
    const { item, scenario, scripted, server, grade } = await catalog("contact-profile");
    const reply = await scripted();
    const listing = server.trace.find((call) => call.name === "list_contacts");
    assert(listing);
    expect(gradeSelection(item, scenario, [listing])).toEqual([]);
    expect(gradeSelection(item, scenario, [])).not.toEqual([]);
    expect((await grade(reply, [listing])).selection).toEqual([]);
    const jo = await database.client.query<{ id: string }>(
      "select id from contacts where organization_id = 'alder' and name = 'Jo Bell'",
    );
    const contactId = jo.rows[0]?.id;
    assert(contactId);
    await scripted(async (call) => {
      await call("get_contact", { workspaceSlug: "alder", contactId });
      await call("list_contacts", { workspaceSlug: "alder", archived: true });
      return reply;
    });
    const card = server.trace.find((call) => call.name === "get_contact");
    const archived = server.trace.at(-1);
    assert(card && archived);
    expect(gradeSelection(item, scenario, [card])).toEqual([]);
    expect((await grade(reply, [card])).selection).toEqual([]);
    expect((await grade(reply, [archived])).selection).toContainEqual(
      expect.stringContaining("Jo's email"),
    );
    expect((await grade("jo@wrong.test", [listing])).reply.status).toBe("failed");
    await scripted(async (call) => {
      await call("update_contact", {
        workspaceSlug: "alder",
        contactId,
        details: { name: "Jo Bell", email: "jo.new@example.test", affiliation: "Review Panel" },
      });
      return reply;
    });
    expect(gradeSelection(item, scenario, server.trace)).toContain("Unexpected update_contact");
  },
);

catalogTest("checks Sam's links after assigning him to Lanterns", async ({ catalog }) => {
  const { grade, scripted, server } = await catalog("link-contact");
  const reply = await scripted();
  const lookup = server.trace.find((call) => call.name === "list_contact_applications");
  assert(lookup);
  const writes = server.trace.filter((call) => call !== lookup);
  expect((await grade(reply, [lookup, ...writes])).selection).toContainEqual(
    expect.stringContaining("workspace lookup"),
  );
  await scripted(async (call) => {
    await call("list_contact_applications", {
      ...lookup.arguments,
      contactId: crypto.randomUUID(),
    });
    return reply;
  });
  const wrongLookup = server.trace.at(-1);
  assert(wrongLookup);
  expect((await grade(reply, [...writes, wrongLookup])).selection).toContainEqual(
    expect.stringContaining("workspace lookup"),
  );
  expect((await grade(reply, server.trace)).selection).toEqual([]);
});

catalogTest(
  "a lookup made after linking Jo cannot establish Sam’s applications",
  async ({ catalog }) => {
    const { scripted, grade } = await catalog("link-contact");
    const reply = await scripted(async (call) => {
      const jo = await findContact(call, "Jo Bell");
      await editIntake(call, "select_application_contact", { contactId: jo.contactId });
      await call("list_contact_applications", {
        workspaceSlug: jo.workspaceSlug,
        contactId: jo.contactId,
      });
      const samId = crypto.randomUUID();
      await call("create_contact", {
        workspaceSlug: jo.workspaceSlug,
        contactId: samId,
        details: { name: "Sam Reed", email: "sam@example.test", affiliation: "Review Panel" },
      });
      await editIntake(call, "select_application_contact", { contactId: samId });
      return "Sam is linked to Lanterns.";
    });
    const result = await grade(reply);
    expect(result.effects).toEqual([]);
    expect(result.selection).toContainEqual(expect.stringContaining("workspace lookup for Sam"));
  },
);

catalogTest("matches each application to Jo’s role", async ({ catalog }) => {
  const { scripted, grade } = await catalog("contact-applications");
  expect((await grade(await scripted())).reply.status).toBe("partial");
  expect(
    (await grade("Jo reviewed Library Nights and is the applicant contact for Lanterns.")).reply
      .status,
  ).toBe("partial");
  expect(
    (await grade("Lanterns: recorded assessment. Library Nights: applicant contact.")).reply.status,
  ).toBe("failed");
});

catalogTest(
  "requires the blocked archive reply to report the outcome and its cause",
  async ({ catalog }) => {
    const { scripted, grade } = await catalog("blocked-archive");
    expect((await grade(await scripted())).reply.status).toBe("passed");
    for (const denial of ["Jo has not been archived", "Jo wasn’t archived"]) {
      expect(
        (await grade(denial + " because of the outstanding review request.")).reply.status,
      ).toBe("passed");
    }
    expect((await grade("Jo was archived. I checked the review.")).reply.status).toBe("failed");
    expect(
      (await grade("Jo was archived despite the outstanding review request.")).reply.status,
    ).toBe("failed");
    expect((await grade("The archive failed.")).reply.status).toBe("failed");
  },
);
