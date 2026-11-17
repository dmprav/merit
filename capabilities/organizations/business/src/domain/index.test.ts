import { describe, expect, it } from "vite-plus/test";

import type { OrganizationSubject } from "@merit/access";

import { evaluateMemberChange, invitationProblem, revokesReviewAccess } from ".";

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

  it.each([
    {
      change: "demoting an administrator",
      actor: owner,
      target: admin,
      access: grantAccess,
      revoke: true,
    },
    { change: "removing a member", actor: admin, target: manager, access: null, revoke: true },
    {
      change: "appointing an administrator",
      actor: owner,
      target: manager,
      access: adminAccess,
      revoke: false,
    },
    {
      change: "retaining administration",
      actor: owner,
      target: admin,
      access: adminAccess,
      revoke: false,
    },
    {
      change: "changing only grant access",
      actor: admin,
      target: manager,
      access: { administration: "none", role: "member" },
      revoke: false,
    },
  ] as const)(
    "revokes the target's issued invitations when $change: $revoke",
    ({ actor, target, access, revoke }) => {
      expect(evaluateMemberChange(actor, target, access)).toEqual({
        status: "ok",
        value: { access, revokeIssuedInvitations: revoke },
      });
    },
  );

  it("keeps the owner's ownership and issued invitations when their grant access changes", () => {
    expect(evaluateMemberChange(admin, owner, adminAccess)).toEqual({
      status: "ok",
      value: {
        access: { administration: "owner", role: "member" },
        revokeIssuedInvitations: false,
      },
    });
  });
});

describe("review access after a membership change", () => {
  it.each([
    ["member", "member", false],
    ["member", "reviewer", false],
    ["member", "program_manager", false],
    ["member", null, false],
    ["member", "committee_reader", false],
    ["reviewer", "member", true],
    ["reviewer", "reviewer", false],
    ["reviewer", "program_manager", false],
    ["reviewer", null, true],
    ["reviewer", "committee_reader", true],
    ["program_manager", "member", true],
    ["program_manager", "reviewer", false],
    ["program_manager", "program_manager", false],
    ["program_manager", null, true],
    ["program_manager", "committee_reader", true],
    ["committee_reader", "member", false],
    ["committee_reader", "reviewer", false],
    ["committee_reader", "program_manager", false],
    ["committee_reader", "committee_reader", false],
    ["committee_reader", null, false],
  ] as const)("changing %s to %s revokes review access: %s", (before, after, expected) => {
    expect(revokesReviewAccess(before, after)).toBe(expected);
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
