import { describe, expect, it } from "vite-plus/test";

import { administratorInvitationState } from "./queries";

describe("initial administrator status", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const pending = {
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date("2026-11-10T12:00:00Z"),
  };
  it("reports an existing owner as joined even without an active invitation", () => {
    expect(administratorInvitationState(null, new Date("2026-11-09T12:00:00Z"), true)).toBe(
      "joined",
    );
  });

  it("distinguishes absence, revocation, pending, expiry and completed onboarding", () => {
    expect(administratorInvitationState(null, now)).toBe("needsAdmin");
    expect(administratorInvitationState({ ...pending, revokedAt: now }, now)).toBe("needsAdmin");
    expect(administratorInvitationState(pending, now)).toBe("pending");
    expect(administratorInvitationState({ ...pending, expiresAt: now }, now)).toBe("expired");
    expect(administratorInvitationState({ ...pending, expiresAt: now, acceptedAt: now }, now)).toBe(
      "joined",
    );
  });
});
