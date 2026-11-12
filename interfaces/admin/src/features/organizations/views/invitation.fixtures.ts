import type { Organization } from "../contracts";

export const invitation: NonNullable<Organization["invitation"]> = {
  id: "invitation-example",
  email: "administrator@example.test",
  delivery: "sent",
  createdAt: new Date("2026-11-01T12:00:00Z"),
  expiresAt: new Date("2099-11-08T12:00:00Z"),
  acceptedAt: null,
  revokedAt: null,
};
