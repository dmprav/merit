import { expect, it, vi } from "vite-plus/test";

import { testOperations } from "../../tests/operations";
import { createAssistantCatalog, type AssistantOperations } from "./catalog";

vi.mock(import("./preview-reviews"), async (importOriginal) => ({
  ...(await importOriginal()),
  // A write builder finishes without identifying any affected record.
  assignmentPreview: () => vi.fn(),
}));

it("refuses a write when its preview builder produces no targets", async () => {
  const ops = {
    ...testOperations(),
    readWorkspace: vi.fn<AssistantOperations["readWorkspace"]>().mockResolvedValue({
      id: "alder",
      slug: "alder",
      name: "Alder",
      kind: "standard",
      role: "reviewer",
      administration: "none",
      canWorkOnGrants: false,
      canViewTeam: false,
      demoExpiresAt: null,
    }),
  };
  const catalog = createAssistantCatalog(
    { userId: "reviewer" },
    "alder",
    ops,
    "https://merit.test",
  );
  const receipt = await catalog.preview("respond_to_review", {
    assignmentId: "00000000-0000-4000-a000-000000000001",
    commandId: "00000000-0000-4000-a000-000000000002",
    expectedRevision: 2,
    action: "accept",
    note: "",
  });
  expect(receipt.result.status).toBe("unavailable");
  expect(receipt.preview).toBeUndefined();
});
