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
  ] as const)("%s / %s", (administration, role, members, administrators, grants) => {
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
  });

  it("denies missing facts and unknown actions", () => {
    expect(permits(null, "read_workspace", member)).toBe(false);
    expect(permits({ active: true }, "read_workspace", {})).toBe(false);
    expect(permits(member, "read_workspace")).toBe(false);
    expect(permits({ ...member, role: undefined }, "work_on_grants", member)).toBe(false);

    const owner = { ...member, administration: "owner" as const };

    expect(permits(owner, "remove_member", { ...member, userId: undefined })).toBe(false);

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

  it.each([{ ...owner, active: false }, { ...owner, organizationId: "birch" }, member])(
    "rejects membership changes without current administrative access: %j",
    (actor) => {
      expect(evaluateMemberAccess(actor, peer, null)).toEqual({ status: "forbidden" });
    },
  );

  it("prevents an administrator from removing a peer", () => {
    expect(evaluateMemberAccess(admin, peer, null)).toEqual({ status: "forbidden" });
  });

  it("reserves changes to administrative responsibility to the owner", () => {
    expect(
      evaluateMemberAccess(admin, peer, { administration: "none", role: "program_manager" }),
    ).toEqual({ status: "forbidden" });
    expect(
      evaluateMemberAccess(owner, peer, { administration: "none", role: "program_manager" }),
    ).toEqual({
      status: "ok",
      value: { administration: "none", role: "program_manager" },
    });
  });

  it("allows the owner to remove a peer administrator", () => {
    expect(evaluateMemberAccess(owner, peer, null)).toEqual({ status: "ok", value: null });
  });

  it("protects the owner and self-removal while reserving peer administrator changes to the owner", () => {
    expect(memberActions(admin, member).canRemove).toBe(false);
    expect(memberActions(admin, peer)).toEqual({
      canEdit: true,
      canRemove: false,
      canChangeAdministration: false,
    });
    expect(memberActions(owner, peer)).toEqual({
      canEdit: true,
      canRemove: true,
      canChangeAdministration: true,
    });
    expect(memberActions(admin, { ...owner, userId: "owner" })).toEqual({
      canEdit: true,
      canRemove: false,
      canChangeAdministration: false,
    });
    expect(memberActions(admin, { ...member, userId: "colleague" }).canRemove).toBe(true);
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

  it("permits explicit self-grant but preserves ownership and blocks self-demotion", () => {
    expect(
      evaluateMemberAccess(admin, admin, {
        administration: "administrator",
        role: "program_manager",
      }),
    ).toEqual({
      status: "ok",
      value: { administration: "administrator", role: "program_manager" },
    });
    expect(evaluateMemberAccess(admin, admin, { administration: "none", role: "member" })).toEqual({
      status: "self_change",
    });
    expect(evaluateMemberAccess(owner, owner, null)).toEqual({ status: "owner_protected" });
    expect(
      evaluateMemberAccess(
        admin,
        { ...owner, userId: "owner" },
        { administration: "administrator", role: "member" },
      ),
    ).toEqual({ status: "ok", value: { administration: "owner", role: "member" } });
  });
});
