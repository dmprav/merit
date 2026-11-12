import { describe, expect, it } from "vite-plus/test";

import {
  contactsRequestSchema,
  contactListInput,
  contactReadInput,
  contactHistoryInput,
} from "./queries";

const address = {
  workspaceSlug: "alder",
  contactId: "60000000-0000-4000-8000-000000000001",
};
it("accepts a workspace address for the contact directory", () => {
  expect(contactsRequestSchema.parse({ workspaceSlug: "alder" })).toEqual({
    workspaceSlug: "alder",
  });
});

describe.each([
  { name: "contact list", schema: contactListInput, input: { workspaceSlug: "alder" } },
  { name: "contact history", schema: contactHistoryInput, input: address },
])("$name pagination", ({ schema, input }) => {
  it("defaults to 20 records", () => {
    expect(schema.parse(input)).toEqual({ ...input, limit: 20 });
  });

  it("accepts page sizes at both supported boundaries", () => {
    for (const limit of [1, 50]) {
      expect(schema.parse({ ...input, limit })).toEqual({ ...input, limit });
    }
  });

  it.each([0, 51, 1.5, "20", null])("rejects invalid page size %j", (limit) => {
    expect(schema.safeParse({ ...input, limit }).success).toBe(false);
  });

  it("rejects caller-supplied ownership", () => {
    expect(schema.safeParse({ ...input, organizationId: "birch" }).success).toBe(false);
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

  it("accepts a nonnegative integer history cursor without coercing or rounding it", () => {
    for (const afterRevision of [0, 7]) {
      expect(contactHistoryInput.parse({ ...address, afterRevision })).toEqual({
        ...address,
        afterRevision,
        limit: 20,
      });
    }
    for (const afterRevision of [-1, 0.5, "0", null]) {
      expect(contactHistoryInput.safeParse({ ...address, afterRevision }).success).toBe(false);
    }
  });
});
