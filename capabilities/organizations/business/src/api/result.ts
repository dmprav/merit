import { z } from "zod";

export const organizationProblemSchema = z.enum([
  "forbidden",
  "not_found",
  "address_taken",
  "invalid_input",
  "already_joined",
  "expired",
  "revoked",
  "wrong_account",
  "disabled",
  "membership_conflict",
  "conflict",
  "invitation_exists",
  "invitation_cooldown",
  "invitation_hourly_limit",
  "invitation_daily_limit",
  "owner_protected",
  "self_change",
]);

export type OrganizationProblem = z.infer<typeof organizationProblemSchema>;

export type Result<T> = { status: "ok"; value: T } | { status: OrganizationProblem };
