import { assert, expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";
import { gradeSelection } from "../tool-selection";

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
