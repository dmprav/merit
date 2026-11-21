import { assert, expect, it, vi } from "vite-plus/test";

import type { ContactOperations } from "./operations";
import { createContactTools } from "./tools";

it("identifies the applications that prevent archiving a shared contact", async () => {
  const changeContact = vi.fn<ContactOperations["changeContact"]>().mockResolvedValue({
    status: "invalid",
    error: "outstanding_requests",
    outstanding: [{ publicId: "k7m2p9x4n6rt", title: "Meals" }],
  });
  const actor = { userId: "manager" };
  const tools = createContactTools(actor, {
    changeContact,
    getContact: vi.fn(),
    listContactSummaries: vi.fn(),
  });
  const archive = tools.find((tool) => tool.name === "archive_contact");
  assert(archive);
  const input = {
    workspaceSlug: "alder",
    contactId: crypto.randomUUID(),
    expectedContactRevision: 2,
  };
  expect(await archive.execute(input)).toEqual({
    status: "invalid",
    error: "outstanding_requests",
    outstanding: [{ applicationId: "k7m2p9x4n6rt", title: "Meals" }],
  });
  expect(changeContact).toHaveBeenCalledWith(actor, { ...input, action: "archive" });
});
