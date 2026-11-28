import { expect, it, vi } from "vite-plus/test";

import { createAssistantHost } from "./host.server";
import type { AssistantCommand } from "./http.server";

const host = (apiKey: string) => {
  const database = vi.fn(async () => {
    throw new Error("Database unavailable");
  });
  const wakeConversation = vi.fn(async () => true);
  const assistant = createAssistantHost(
    {
      database,
      invitationOrigin: "https://merit.test",
      startReviewerMessage: async () => true,
      startOrganizationInvitation: async () => true,
      cancelConversation: async () => {},
      wakeConversation,
    },
    { apiKey, model: "scripted" },
  );

  const command = (input: AssistantCommand) =>
    assistant.command({ userId: "sam" }, "alder", input, new AbortController().signal);

  return { command, database, wakeConversation };
};

const id = "01h000000000";

it.each([
  { action: "set_consent", enabled: true },
  { action: "create" },
  { action: "start", id, message: "Compare requests" },
  { action: "approve", id, previewId: "preview" },
  { action: "retry", id, previewId: "preview", actionId: "action" },
] satisfies AssistantCommand[])(
  "returns provider_unconfigured for $action without starting work",
  async (input) => {
    const { command, database, wakeConversation } = host("");
    const response = await command(input);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "provider_unconfigured" });
    expect(database).not.toHaveBeenCalled();
    expect(wakeConversation).not.toHaveBeenCalled();
  },
);

it("returns unavailable when a backend operation unexpectedly fails", async () => {
  const { command } = host("test");
  const response = await command({ action: "settings" });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
