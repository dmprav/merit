import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import * as emails from "@merit/emails/server";
import type { InvitationMessage } from "@merit/organizations/api";
import { productLinks } from "@merit/product/links";

import type { EmailSender } from "../src/server/email-delivery.server";
import { sendInvitationEmail } from "../src/server/invitation-email.server";

afterEach(() => vi.restoreAllMocks());

const message: InvitationMessage = {
  id: "invitation-id",
  to: "recipient@example.test",
  organizationName: "Alder Foundation",
  url: new URL(productLinks.invitation("private-token"), "https://merit.example").href,
  expiresAt: new Date("2026-11-16T12:00:00Z"),
  administration: "owner",
  role: "program_manager",
};

it("sends the organization's invitation link in HTML and plain text with its recipient and retry identity", async () => {
  const sendEmail = vi.fn<EmailSender>().mockResolvedValue(undefined);

  await sendInvitationEmail(message, sendEmail);

  expect(sendEmail).toHaveBeenCalledOnce();
  const call = sendEmail.mock.calls[0];
  assert.isDefined(call);
  const [sent] = call;

  expect(sent).toMatchObject({
    id: message.id,
    to: message.to,
    subject: "Join Alder Foundation on Merit",
  });
  expect(sent.html).toContain(`href="${message.url}"`);
  expect(sent.text).toContain(message.url);
});

it("reports rendering failure safely and does not send incomplete content", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(emails, "renderInvitationEmail").mockRejectedValueOnce(new Error(message.url));
  const sendEmail = vi.fn<EmailSender>();

  await expect(sendInvitationEmail(message, sendEmail)).rejects.toThrow(
    "Invitation email rendering failed.",
  );

  expect(sendEmail).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledExactlyOnceWith("Invitation email rendering failed.");
});
