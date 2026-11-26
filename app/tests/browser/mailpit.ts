import { expect, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { workspacePort } from "./ports.ts";

const inboxSchema = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      To: z.array(z.object({ Address: z.string() })),
      Subject: z.string(),
    }),
  ),
});

const messageSchema = z.object({ Text: z.string() });

export const findInvitationLink = async (
  request: Pick<APIRequestContext, "get">,
  recipient: string,
  organization: string,
  port: number = workspacePort,
): Promise<string | undefined> => {
  const response = await request.get("http://127.0.0.1:8025/api/v1/messages");
  if (!response.ok()) {
    throw new Error(`Mailpit inbox request failed with status ${response.status()}`);
  }
  const inbox = inboxSchema.parse(await response.json());
  const matchingMessages = inbox.messages.filter(
    (entry) =>
      entry.To.some((to) => to.Address === recipient) && entry.Subject.includes(organization),
  );
  const invitationPattern = new RegExp(`http://127\\.0\\.0\\.1:${port}/invitations/[a-f0-9]{64}`);

  for (const message of matchingMessages) {
    const detail = await request.get(`http://127.0.0.1:8025/api/v1/message/${message.ID}`);
    if (!detail.ok()) {
      throw new Error(
        `Mailpit message ${message.ID} request failed with status ${detail.status()}`,
      );
    }
    const { Text } = messageSchema.parse(await detail.json());
    const match = Text.match(invitationPattern)?.[0];
    if (match) {
      return match;
    }
  }

  return undefined;
};

/** Wait for the invitation addressed to this scenario, rather than another browser's email. */
export const invitationLink = async (
  request: APIRequestContext,
  recipient: string,
  organization: string,
) => {
  let link: string | undefined;
  await expect
    .poll(async () => {
      link = await findInvitationLink(request, recipient, organization, workspacePort);
      return Boolean(link);
    })
    .toBe(true);
  if (!link) {
    throw new Error("Expected an invitation link in the delivered email");
  }

  return link;
};
