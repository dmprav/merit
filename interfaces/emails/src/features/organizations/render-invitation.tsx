import { render, toPlainText } from "react-email";

import { createMessages, ServerMessagesProvider, type LocaleSettings } from "@merit/i18n/server";
import type { InvitationMessage } from "@merit/organizations/api";

import { InvitationEmail } from "./invitation";
import { emailMessages } from "./messages";

export const renderInvitationEmail = async (message: InvitationMessage, locale: LocaleSettings) => {
  const instance = createMessages(emailMessages, locale);
  const t = instance.getFixedT(locale.language, "invitationEmail");
  const html = await render(
    <ServerMessagesProvider instance={instance} locale={locale}>
      <InvitationEmail {...message} />
    </ServerMessagesProvider>,
  );
  return {
    subject: t("subject", { organizationName: message.organizationName }),
    html,
    text: toPlainText(html),
  };
};
