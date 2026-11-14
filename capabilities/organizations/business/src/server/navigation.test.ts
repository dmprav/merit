import { expect, it, vi } from "vite-plus/test";

import { createOrganizationService } from "./index";

it("discovers operator navigation using the same current policy as administration operations", async () => {
  const actor = { userId: "operator" };
  let authorized = true;
  const database = vi.fn(async () => {
    throw new Error("Navigation must not read tenant data");
  });
  const service = createOrganizationService({
    revokeReviewAccess: async () => {},
    database,
    isOperator: () => authorized,
    verifiedEmails: async () => [],
    sendInvitation: async () => {},
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example").href,
  });

  expect(service.canAdminister(actor)).toBe(true);

  authorized = false;

  expect(service.canAdminister(actor)).toBe(false);
  expect(await service.list(actor)).toEqual({ status: "forbidden" });
  expect(database).not.toHaveBeenCalled();
});
