import { describe, expect, it } from "vite-plus/test";

import { contactsRequestSchema, contactListInput, contactReadInput } from "./queries";

const address = {
  workspaceSlug: "alder",
  contactId: "60000000-0000-4000-8000-000000000001",
};
it("accepts a workspace address for the contact directory", () => {
  expect(contactsRequestSchema.parse({ workspaceSlug: "alder" })).toEqual({
    workspaceSlug: "alder",
  });
});

describe("contact list pagination", () => {
  const input = { workspaceSlug: "alder" };
  it("defaults to 20 records", () => {
    expect(contactListInput.parse(input)).toEqual({ ...input, limit: 20 });
  });

  it("accepts page sizes at both supported boundaries", () => {
    for (const limit of [1, 50]) {
      expect(contactListInput.parse({ ...input, limit })).toEqual({ ...input, limit });
    }
  });

  it.each([0, 51, 1.5, "20", null])("rejects invalid page size %j", (limit) => {
    expect(contactListInput.safeParse({ ...input, limit }).success).toBe(false);
  });

  it("rejects caller-supplied ownership", () => {
    expect(contactListInput.safeParse({ ...input, organizationId: "birch" }).success).toBe(false);
  });
});

describe("contact read addresses", () => {
  it("requires a workspace and a contact identifier", () => {
    expect(contactReadInput.parse(address)).toEqual(address);

    for (const input of [
      { contactId: address.contactId },
      { workspaceSlug: address.workspaceSlug },
      { ...address, contactId: "Sam Reed" },
      { ...address, organizationId: "birch" },
    ]) {
      expect(contactReadInput.safeParse(input).success).toBe(false);
    }
  });

  it("preserves a list cursor and an explicit archived filter", () => {
    for (const archived of [true, false]) {
      const input = { workspaceSlug: "alder", after: address.contactId, archived };

      expect(contactListInput.parse(input)).toEqual({ ...input, limit: 20 });
    }
    expect(contactListInput.safeParse({ workspaceSlug: "alder", after: "Sam Reed" }).success).toBe(
      false,
    );
    expect(contactListInput.safeParse({ workspaceSlug: "alder", archived: "false" }).success).toBe(
      false,
    );
  });
});
