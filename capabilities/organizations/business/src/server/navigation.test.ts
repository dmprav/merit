import { expect, it, vi } from "vite-plus/test";

import { createOrganizationService } from "./index";

it("discovers operator navigation using the same current policy as administration operations", async () => {
  const actor = { userId: "operator" };
  let authorized = true;
  const database = vi.fn(async () => {
    throw new Error("Navigation must not read tenant data");
  });
  const service = createOrganizationService({
    invitationKey: () => new Uint8Array(32),
    revokeReviewAccess: async () => {},
    database,
    isOperator: async () => authorized,
    verifiedEmails: async () => [],
    start: async () => true,
  });

  expect(await service.canAdminister(actor)).toBe(true);

  authorized = false;

  expect(await service.canAdminister(actor)).toBe(false);
  expect(await service.list(actor)).toEqual({ status: "forbidden" });
  expect(database).not.toHaveBeenCalled();
});
