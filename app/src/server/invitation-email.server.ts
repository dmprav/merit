import { renderInvitationEmail } from "@merit/emails/server";
import { defaultLocale } from "@merit/i18n/server";
import type { InvitationMessage } from "@merit/organizations/api";

import type { EmailSender } from "./email-delivery.server";

export const sendInvitationEmail = async (message: InvitationMessage, sendEmail: EmailSender) => {
  let content: Awaited<ReturnType<typeof renderInvitationEmail>>;
  try {
    content = await renderInvitationEmail(message, defaultLocale);
  } catch {
    console.error("Invitation email rendering failed.");
    throw new Error("Invitation email rendering failed.");
  }

  await sendEmail({ id: message.id, to: message.to, ...content });
};
