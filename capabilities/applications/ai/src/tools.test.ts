import { assert, expect, it, vi } from "vite-plus/test";

import type { ApplicationsService } from "@merit/applications/api";

import { createApplicationTools } from "./tools";

it("returns the application ID and new intake revision in the publish receipt", async () => {
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
});

it("keeps PDF selection out of MCP creation and draft editing", async () => {
  const service = { createApplication: vi.fn(), editApplication: vi.fn(), selectContact: vi.fn() };
  const tools = createApplicationTools({ userId: "manager" }, service);
  const workspaceSlug = "alder";
  const applicationId = "k7m2p9x4n6rt";
  const revision = { workspaceSlug, applicationId, expectedIntakeRevision: 1 };
  const cases = [
    [
      "create_application",
      {
        workspaceSlug,
        roundId: applicationId,
        requestId: crypto.randomUUID(),
        title: "Proposal",
        pdfs: [],
      },
    ],
    [
      "edit_application",
      { ...revision, change: { action: "save_content", content: { pdfs: [] } } },
    ],
    [
      "save_application_revision",
      { ...revision, draft: { kind: "revision", reason: "Update", content: { pdfs: [] } } },
    ],
  ] as const;
  for (const [name, input] of cases) {
    const tool = tools.find((entry) => entry.name === name);
    assert(tool);
    expect(await tool.execute(input)).toMatchObject({ status: "invalid_input" });
  }
  expect(service.createApplication).not.toHaveBeenCalled();
  expect(service.editApplication).not.toHaveBeenCalled();
});
