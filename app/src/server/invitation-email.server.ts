import { renderInvitationEmail } from "@merit/emails/server";
import { defaultLocale } from "@merit/i18n/server";
import type { InvitationMessage } from "@merit/organizations/api";
import { reportError } from "@merit/telemetry/errors";

import type { EmailSender } from "./email-delivery.server";

export const sendInvitationEmail = async (message: InvitationMessage, sendEmail: EmailSender) => {
  let content: Awaited<ReturnType<typeof renderInvitationEmail>>;
  try {
    content = await renderInvitationEmail(message, defaultLocale);
  } catch (error) {
    reportError(error, { surface: "email", operation: "email.renderInvitation" });
    throw new Error("Invitation email rendering failed.");
  }

  await sendEmail({ id: message.id, to: message.to, ...content });
};
