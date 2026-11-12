import { describe, expect, it } from "vite-plus/test";

import { contactCommandSchema } from "./commands";

const address = {
  workspaceSlug: "alder",
  contactId: "60000000-0000-4000-8000-000000000001",
};
const details = { name: "", email: "office@example.test", affiliation: "" };

describe("contact commands", () => {
  it("accepts email-only contacts for creation and updates", () => {
    const create = { ...address, action: "create", details };
    const update = { ...address, action: "update", details, expectedContactRevision: 0 };

    expect(contactCommandSchema.parse(create)).toEqual(create);
    expect(contactCommandSchema.parse(update)).toEqual(update);
  });

  it("accepts a name without an email and trims the shared profile's text", () => {
    const command = {
      ...address,
      action: "create",
      details: { name: "  Sam Reed  ", email: "", affiliation: "  Alder Foundation  " },
    };

    expect(contactCommandSchema.parse(command)).toEqual({
      ...command,
      details: { name: "Sam Reed", email: "", affiliation: "Alder Foundation" },
    });
  });

  it.each(["name", "affiliation"] as const)(
    "limits %s to 200 characters after trimming",
    (field) => {
      const command = {
        ...address,
        action: "create",
        details: { ...details, [field]: ` ${"a".repeat(200)} ` },
      };

      expect(contactCommandSchema.parse(command)).toEqual({
        ...command,
        details: { ...details, [field]: "a".repeat(200) },
      });
      expect(
        contactCommandSchema.safeParse({
          ...command,
          details: { ...details, [field]: "a".repeat(201) },
        }).success,
      ).toBe(false);
    },
  );

  it("rejects missing identity and malformed email", () => {
    for (const details of [
      { name: "  ", email: "", affiliation: "A foundation" },
      { name: "Sam", email: "not-an-email", affiliation: "" },
    ]) {
      expect(
        contactCommandSchema.safeParse({ ...address, action: "create", details }).success,
      ).toBe(false);
    }
  });

  it.each(["update", "archive", "restore"])("requires an integer revision for %s", (action) => {
    const command = { ...address, action, ...(action === "update" ? { details } : {}) };

    for (const expectedContactRevision of [undefined, null, -1, 0.5, "0"]) {
      expect(contactCommandSchema.safeParse({ ...command, expectedContactRevision }).success).toBe(
        false,
      );
    }
    for (const expectedContactRevision of [0, 7]) {
      expect(contactCommandSchema.parse({ ...command, expectedContactRevision })).toEqual({
        ...command,
        expectedContactRevision,
      });
    }
  });

  it("keeps lifecycle and ownership changes out of profile updates", () => {
    const command = { ...address, action: "update", details, expectedContactRevision: 0 };

    expect(contactCommandSchema.safeParse({ ...command, archived: true }).success).toBe(false);
    expect(
      contactCommandSchema.safeParse({
        ...command,
        details: { ...details, organizationId: "birch" },
      }).success,
    ).toBe(false);
  });

  it.each(["archive", "restore"])("keeps profile changes out of %s commands", (action) => {
    const command = { ...address, action, expectedContactRevision: 0 };

    expect(contactCommandSchema.safeParse({ ...command, details }).success).toBe(false);
    expect(contactCommandSchema.safeParse({ ...command, archived: true }).success).toBe(false);
  });

  it("rejects caller-supplied ownership on creation", () => {
    expect(
      contactCommandSchema.safeParse({
        ...address,
        action: "create",
        details,
        organizationId: "birch",
      }).success,
    ).toBe(false);
  });
});
