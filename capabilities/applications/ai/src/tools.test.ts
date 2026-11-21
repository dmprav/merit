import { assert, expect, it, vi } from "vite-plus/test";

import type { ApplicationsService } from "@merit/applications/api";

import { createApplicationTools } from "./tools";

it("publishes a working revision using the signed-in actor and original intake revision", async () => {
  const actor = { userId: "manager" };
  const editApplication = vi
    .fn<ApplicationsService["editApplication"]>()
    .mockResolvedValue({ status: "ok", revision: 5 });
  const tools = createApplicationTools(actor, {
    editApplication,
    createApplication: vi.fn(),
    selectContact: vi.fn(),
  });
  const publish = tools.find((tool) => tool.name === "publish_application_revision");
  assert(publish);
  const applicationId = "k7m2p9x4n6rt";
  expect(
    await publish.execute({ workspaceSlug: "alder", applicationId, expectedIntakeRevision: 4 }),
  ).toEqual({ status: "ok", applicationId, intakeRevision: 5 });
  expect(editApplication).toHaveBeenCalledWith(actor, {
    workspaceSlug: "alder",
    publicId: applicationId,
    expectedRevision: 4,
    change: { action: "publish_revision" },
  });
});
