import { describe, expect, it } from "vite-plus/test";

import {
  permits,
  memberActions,
  evaluateMemberAccess,
  type OrganizationSubject,
  type AccessAction,
} from ".";

const member: OrganizationSubject = {
  userId: "person",
  organizationId: "alder",
  active: true,
  administration: "none",
  role: "member",
};

describe("workspace access", () => {
  it("limits reviewer work to the active assigned person, with no staff override", () => {
    const assignment = {
      reviewerUserId: "sam",
      reviewStatus: "accepted" as const,
      reviewMembershipCurrent: true,
    };
    expect(permits({ userId: "sam", active: true }, "work_on_review", assignment)).toBe(true);
    expect(
      permits({ userId: "sam", active: true }, "work_on_review", {
        ...assignment,
        reviewStatus: "submitted",
      }),
    ).toBe(true);
    expect(permits({ userId: "sam", active: false }, "work_on_review", assignment)).toBe(false);
    expect(
      permits({ userId: "sam", active: true }, "work_on_review", {
        ...assignment,
        reviewMembershipCurrent: false,
      }),
    ).toBe(false);
    expect(
      permits(
        { ...member, role: "program_manager", administration: "owner" },
        "work_on_review",
        assignment,
      ),
    ).toBe(false);
    for (const reviewStatus of ["invited", "conflict", "cancelled", "declined"] as const) {
      expect(
        permits({ userId: "sam", active: true }, "work_on_review", { ...assignment, reviewStatus }),
      ).toBe(false);
    }
  });

  it.each([
    ["none", "member", false, false, false],
    ["none", "program_manager", false, false, true],
    ["none", "reviewer", false, false, false],
    ["none", "committee_reader", false, false, false],
    ["administrator", "member", true, false, false],
    ["administrator", "program_manager", true, false, true],
    ["owner", "member", true, true, false],
    ["owner", "program_manager", true, true, true],
  ] as const)(
    "decides workspace actions by administration and role within an active membership: %s / %s",
    (administration, role, members, administrators, grants) => {
      const subject = { ...member, administration, role };
      const expected = {
        read_workspace: true,
        manage_members: members,
        manage_administrators: administrators,
        work_on_grants: grants,
      };
      for (const action of Object.keys(expected) as (keyof typeof expected)[]) {
        expect(permits(subject, action, member), action).toBe(expected[action]);
        expect(permits({ ...subject, active: false }, action, member)).toBe(false);
        expect(permits(subject, action, { organizationId: "birch" })).toBe(false);
      }
    },
  );

  it("denies access when a required fact is missing", () => {
    expect(permits(null, "read_workspace", member)).toBe(false);
    expect(permits({ active: true }, "read_workspace", {})).toBe(false);
    expect(permits(member, "read_workspace")).toBe(false);
    expect(permits({ ...member, role: undefined }, "work_on_grants", member)).toBe(false);
    expect(
      permits({ ...member, administration: "owner" }, "remove_member", {
        ...member,
        userId: undefined,
      }),
    ).toBe(false);
  });

  it("denies unknown actions, including inherited property names", () => {
    const owner = { ...member, administration: "owner" as const };

    for (const action of ["missing", "constructor", "toString", "__proto__"]) {
      expect(permits(owner, action as AccessAction, member)).toBe(false);
    }
  });

  it("keeps operator designation independent of workspace access", () => {
    expect(permits({ operator: true }, "administer_organizations")).toBe(true);
    expect(permits({ operator: false }, "administer_organizations")).toBe(false);
    expect(permits(member, "administer_organizations")).toBe(false);
    expect(permits({ operator: true }, "work_on_grants", member)).toBe(false);
    expect(permits({ ...member, administration: "owner" }, "administer_organizations")).toBe(false);
  });
});

describe("membership authority", () => {
  const admin = { ...member, administration: "administrator" as const };
  const owner = { ...member, administration: "owner" as const };
  const peer = { ...admin, userId: "peer" };
  const colleague = { ...member, userId: "colleague" };
  const grantAccess = { administration: "none", role: "program_manager" } as const;
  const adminAccess = { administration: "administrator", role: "member" } as const;

  it.each([{ ...owner, active: false }, { ...owner, organizationId: "birch" }, member])(
    "rejects membership changes without current administrative access: %j",
    (actor) => {
      expect(memberActions(actor, colleague)).toEqual({
        canEdit: false,
        canRemove: false,
        canChangeAdministration: false,
      });
      expect(evaluateMemberAccess(actor, peer, null)).toEqual({ status: "forbidden" });
      expect(
        permits(actor, "manage_invitation", {
          organizationId: member.organizationId,
          administration: "none",
        }),
      ).toBe(false);
    },
  );

  it("lets an administrator change a member's grant access or remove them", () => {
    expect(memberActions(admin, colleague)).toEqual({
      canEdit: true,
      canRemove: true,
      canChangeAdministration: false,
    });
    expect(evaluateMemberAccess(admin, colleague, grantAccess)).toEqual({
      status: "ok",
      value: grantAccess,
    });
    expect(evaluateMemberAccess(admin, colleague, null)).toEqual({ status: "ok", value: null });
  });

  it("prevents an administrator from removing a peer", () => {
    expect(memberActions(admin, peer).canRemove).toBe(false);
    expect(evaluateMemberAccess(admin, peer, null)).toEqual({ status: "forbidden" });
  });

  it("reserves appointments and demotions of administrators to the owner", () => {
    expect(memberActions(admin, peer).canChangeAdministration).toBe(false);
    expect(evaluateMemberAccess(admin, colleague, adminAccess)).toEqual({ status: "forbidden" });
    expect(evaluateMemberAccess(admin, peer, grantAccess)).toEqual({ status: "forbidden" });
    expect(memberActions(owner, peer).canChangeAdministration).toBe(true);
    expect(evaluateMemberAccess(owner, colleague, adminAccess)).toEqual({
      status: "ok",
      value: adminAccess,
    });
    expect(evaluateMemberAccess(owner, peer, grantAccess)).toEqual({
      status: "ok",
      value: grantAccess,
    });
  });

  it("allows the owner to remove a peer administrator", () => {
    expect(memberActions(owner, peer).canRemove).toBe(true);
    expect(evaluateMemberAccess(owner, peer, null)).toEqual({ status: "ok", value: null });
  });

  it.each([
    ["the owner", owner, owner],
    ["an administrator", admin, { ...owner, userId: "owner" }],
  ])("protects the owner from removal and demotion by %s", (_, actor, target) => {
    expect(memberActions(actor, target)).toEqual({
      canEdit: true,
      canRemove: false,
      canChangeAdministration: false,
    });
    expect(evaluateMemberAccess(actor, target, null)).toEqual({ status: "owner_protected" });
    expect(evaluateMemberAccess(actor, target, grantAccess)).toEqual({
      status: "owner_protected",
    });
    expect(evaluateMemberAccess(actor, target, adminAccess)).toEqual({
      status: "ok",
      value: { administration: "owner", role: "member" },
    });
  });

  it("prevents self-removal and self-demotion", () => {
    expect(memberActions(admin, admin).canRemove).toBe(false);
    expect(evaluateMemberAccess(admin, admin, null)).toEqual({ status: "self_change" });
    expect(evaluateMemberAccess(admin, admin, grantAccess)).toEqual({ status: "self_change" });
  });

  it("permits an administrator to change their own grant access explicitly", () => {
    expect(
      evaluateMemberAccess(admin, admin, {
        administration: "administrator",
        role: "program_manager",
      }),
    ).toEqual({
      status: "ok",
      value: { administration: "administrator", role: "program_manager" },
    });
  });

  it("applies invitation authority to the requested responsibility", () => {
    for (const administration of ["none", "administrator", "owner"] as const) {
      const invitation = { organizationId: member.organizationId, administration };

      expect(permits(member, "manage_invitation", invitation)).toBe(false);
      expect(permits(admin, "manage_invitation", invitation)).toBe(administration === "none");
      expect(permits(owner, "manage_invitation", invitation)).toBe(true);
      expect(permits(owner, "manage_invitation", { ...invitation, organizationId: "birch" })).toBe(
        false,
      );
    }
  });
});
