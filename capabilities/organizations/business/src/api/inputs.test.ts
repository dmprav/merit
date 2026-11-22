import { describe, expect, it } from "vite-plus/test";

import {
  createOrganizationInput,
  inviteMemberInput,
  memberInput,
  suggestSlug,
  teamInput,
} from "./index";

const input = {
  requestId: "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc",
  name: "Foundation",
  slug: "foundation",
  email: "person@example.test",
};
describe("organization input boundaries", () => {
  it("validates the target user and invitation IDs for a membership change", () => {
    const change = {
      workspaceSlug: input.slug,
      userId: "u".repeat(100),
      expectedMembershipId: input.requestId,
      expectedMembershipVersion: 0,
      expectedInvitationIds: [input.requestId],
    };
    expect(memberInput.safeParse(change).success).toBe(true);
    expect(memberInput.safeParse({ ...change, userId: change.userId + "u" }).success).toBe(false);
    expect(memberInput.safeParse({ ...change, expectedInvitationIds: ["invalid"] }).success).toBe(
      false,
    );
  });

  it.each([
    ["none", "member", false],
    ["none", "program_manager", true],
    ["administrator", "member", true],
    ["administrator", "program_manager", true],
  ] as const)(
    "requires a responsibility when inviting %s / %s",
    (administration, role, accepted) => {
      expect(
        inviteMemberInput.safeParse({
          workspaceSlug: input.slug,
          requestId: input.requestId,
          email: input.email,
          administration,
          role,
        }).success,
      ).toBe(accepted);
    },
  );

  it("rejects reserved addresses, path escapes and blank names", () => {
    for (const slug of [
      "",
      "Alder",
      "sign-in",
      "organizations",
      "a/b",
      "--",
      "../admin",
      "é",
      "a".repeat(81),
    ]) {
      expect(createOrganizationInput.safeParse({ ...input, slug }).success).toBe(false);
      expect(teamInput.safeParse({ workspaceSlug: slug }).success).toBe(false);
    }

    expect(createOrganizationInput.safeParse({ ...input, name: "  " }).success).toBe(false);
  });

  it("accepts the same workspace addresses for provisioning and team access", () => {
    for (const slug of ["alder", "alder-2027", "a".repeat(80)]) {
      expect(createOrganizationInput.safeParse({ ...input, slug }).success).toBe(true);
      expect(teamInput.safeParse({ workspaceSlug: slug }).success).toBe(true);
    }
  });

  it("suggests a bounded address without trailing separators", () => {
    expect(suggestSlug("  Éducation & Arts! ")).toBe("education-arts");
    expect(suggestSlug("a".repeat(79) + " - extra")).toBe("a".repeat(79));
  });

  it("normalizes the owner's email so it matches their verified identity", () => {
    expect(createOrganizationInput.parse({ ...input, email: "Person@Example.test" }).email).toBe(
      "person@example.test",
    );
  });
});
