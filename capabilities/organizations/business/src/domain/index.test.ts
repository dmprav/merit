import { describe, expect, it } from "vite-plus/test";

import { permits, memberActions, type OrganizationSubject } from "@merit/access";

import { evaluateMemberChange, invitationProblem } from ".";

const owner: OrganizationSubject = {
  userId: "owner",
  organizationId: "foundation",
  active: true,
  administration: "owner",
  role: "member",
};
const admin: OrganizationSubject = { ...owner, userId: "admin", administration: "administrator" };
const manager: OrganizationSubject = {
  ...owner,
  userId: "manager",
  administration: "none",
  role: "program_manager",
};
const grantAccess = { administration: "none", role: "program_manager" } as const;
const adminAccess = { administration: "administrator", role: "member" } as const;

describe("membership decisions", () => {
  it("separates administrative authority from grant access", () => {
    expect(permits(owner, "work_on_grants", owner)).toBe(false);
    expect(permits(manager, "work_on_grants", manager)).toBe(true);
    expect(evaluateMemberChange(manager, admin, grantAccess)).toEqual({ status: "forbidden" });
    expect(permits(admin, "manage_invitation", { ...manager, administration: "none" })).toBe(true);
    expect(
      permits(admin, "manage_invitation", { ...manager, administration: "administrator" }),
    ).toBe(false);
    expect(
      permits(owner, "manage_invitation", { ...manager, administration: "administrator" }),
    ).toBe(true);
  });

  it.each([
    { ...owner, active: false },
    { ...owner, organizationId: "other" },
  ])("denies inactive or out-of-organization actors", (actor) => {
    expect(memberActions(actor, manager)).toEqual({
      canEdit: false,
      canRemove: false,
      canChangeAdministration: false,
    });
    expect(evaluateMemberChange(actor, manager, null)).toEqual({ status: "forbidden" });
    expect(permits(actor, "manage_invitation", { ...manager, administration: "none" })).toBe(false);
  });

  it("reserves appointments and peer administrator removal to the owner", () => {
    expect(evaluateMemberChange(admin, manager, adminAccess)).toEqual({ status: "forbidden" });
    expect(evaluateMemberChange(owner, manager, adminAccess)).toEqual({
      status: "ok",
      value: { access: adminAccess, revokeIssuedInvitations: false },
    });

    const peer = { ...admin, userId: "peer" };

    expect(memberActions(admin, peer).canRemove).toBe(false);
    expect(evaluateMemberChange(admin, peer, null)).toEqual({ status: "forbidden" });
    expect(evaluateMemberChange(admin, peer, grantAccess)).toEqual({ status: "forbidden" });
    expect(evaluateMemberChange(owner, peer, null)).toEqual({
      status: "ok",
      value: { access: null, revokeIssuedInvitations: true },
    });
  });

  it("protects ownership while allowing grant-access changes", () => {
    for (const actor of [owner, admin]) {
      expect(evaluateMemberChange(actor, owner, null)).toEqual({ status: "owner_protected" });
      expect(evaluateMemberChange(actor, owner, grantAccess)).toEqual({
        status: "owner_protected",
      });
      expect(evaluateMemberChange(actor, owner, adminAccess)).toEqual({
        status: "ok",
        value: {
          access: { administration: "owner", role: "member" },
          revokeIssuedInvitations: false,
        },
      });
      expect(memberActions(actor, owner)).toEqual({
        canEdit: true,
        canRemove: false,
        canChangeAdministration: false,
      });
    }
  });

  it("permits explicit self-grant but prevents self-removal and self-demotion", () => {
    expect(
      evaluateMemberChange(admin, admin, { ...adminAccess, role: "program_manager" }),
    ).toMatchObject({ status: "ok" });
    expect(evaluateMemberChange(admin, admin, null)).toEqual({ status: "self_change" });
    expect(evaluateMemberChange(admin, admin, grantAccess)).toEqual({ status: "self_change" });
  });

  it("revokes issued invitations on removal or demotion, but not grant-access changes", () => {
    expect(evaluateMemberChange(owner, admin, grantAccess)).toEqual({
      status: "ok",
      value: { access: grantAccess, revokeIssuedInvitations: true },
    });
    expect(evaluateMemberChange(owner, admin, adminAccess)).toEqual({
      status: "ok",
      value: { access: adminAccess, revokeIssuedInvitations: false },
    });
    expect(evaluateMemberChange(admin, manager, null)).toEqual({
      status: "ok",
      value: { access: null, revokeIssuedInvitations: true },
    });
    expect(
      evaluateMemberChange(admin, manager, { administration: "none", role: "member" }),
    ).toEqual({
      status: "ok",
      value: { access: { administration: "none", role: "member" }, revokeIssuedInvitations: false },
    });
  });
});

describe("invitation validity", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const invitation = {
    email: "recipient@example.test",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date("2026-11-10T12:00:00Z"),
  };
  const emails = [invitation.email];

  it("checks verified identity before exposing lifecycle state", () => {
    expect(invitationProblem({ ...invitation, revokedAt: now }, [], now)).toBe("wrong_account");
    expect(invitationProblem({ ...invitation, revokedAt: now }, emails, now)).toBe("revoked");
  });

  it("uses the supplied clock and does not expire an already accepted invitation", () => {
    expect(invitationProblem(invitation, emails, now)).toBeNull();
    expect(invitationProblem(invitation, emails, invitation.expiresAt)).toBe("expired");
    expect(
      invitationProblem({ ...invitation, acceptedAt: now }, emails, invitation.expiresAt),
    ).toBeNull();
    expect(invitationProblem({ ...invitation, acceptedAt: now, revokedAt: now }, emails, now)).toBe(
      "revoked",
    );
  });
});
