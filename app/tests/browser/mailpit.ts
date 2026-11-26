import { expect, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

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

/** Wait for the invitation addressed to this scenario, rather than another browser's email. */
export const invitationLink = async (
  request: APIRequestContext,
  recipient: string,
  organization: string,
) => {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:8025/api/v1/messages");
      expect(response.ok()).toBe(true);
      const inbox = inboxSchema.parse(await response.json());
      const message = inbox.messages.find(
        (entry) =>
          entry.To.some((to) => to.Address === recipient) && entry.Subject.includes(organization),
      );
      if (!message) {
        return false;
      }

      const detail = await request.get(`http://127.0.0.1:8025/api/v1/message/${message.ID}`);
      expect(detail.ok()).toBe(true);
      const { Text } = messageSchema.parse(await detail.json());
      link = Text.match(/http:\/\/127\.0\.0\.1:3002\/invitations\/[a-f0-9]{64}/)?.[0];
      return Boolean(link);
    })
    .toBe(true);
  if (!link) {
    throw new Error("Expected an invitation link in the delivered email");
  }

  return link;
};
