import { describe, expect, it } from "vite-plus/test";

import type { OrganizationSubject } from "@merit/access";

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
  it("returns an access refusal without a membership change", () => {
    expect(evaluateMemberChange(manager, admin, grantAccess)).toEqual({ status: "forbidden" });
  });

  it("revokes issued invitations on removal or demotion, but not appointments or grant-access changes", () => {
    expect(evaluateMemberChange(owner, admin, grantAccess)).toEqual({
      status: "ok",
      value: { access: grantAccess, revokeIssuedInvitations: true },
    });
    expect(evaluateMemberChange(owner, admin, adminAccess)).toEqual({
      status: "ok",
      value: { access: adminAccess, revokeIssuedInvitations: false },
    });
    expect(evaluateMemberChange(owner, manager, adminAccess)).toEqual({
      status: "ok",
      value: { access: adminAccess, revokeIssuedInvitations: false },
    });
    expect(evaluateMemberChange(admin, owner, adminAccess)).toEqual({
      status: "ok",
      value: {
        access: { administration: "owner", role: "member" },
        revokeIssuedInvitations: false,
      },
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
