import { Button, Heading, Text, render, toPlainText } from "react-email";
import { useTranslation } from "react-i18next";

import { createMessages, defaultLocale, ServerMessagesProvider } from "@merit/i18n/server";
import type { ReviewerMessage } from "@merit/reviews/api";

import { EmailLayout } from "../../app/layout";
import { en } from "./messages.en";

declare module "@merit/i18n/core" {
  interface Messages {
    reviewerEmail: typeof en;
  }
}

const ReviewerEmail = ({ message }: { message: ReviewerMessage }) => {
  const { t } = useTranslation("reviewerEmail");
  return (
    <EmailLayout
      preview={t(`${message.kind}Subject`, { title: message.title })}
      language="en"
      direction="ltr"
    >
      <Heading>{t(`${message.kind}Title`)}</Heading>
      <Text>
        {message.organization} · {message.title}
      </Text>
      <Text>{message.applicant}</Text>
      {message.kind === "invitation" ? (
        <>
          <Text>{t("instructions", { manager: message.manager })}</Text>
          <Text>{t("identity", { email: message.to })}</Text>
          {message.dueDate && <Text>{t("due", { date: message.dueDate })}</Text>}
          <Text>{t("contact", { email: message.managerEmail })}</Text>
        </>
      ) : (
        <Text>{t("submitted", { reviewer: message.reviewer })}</Text>
      )}
      <Button
        href={message.url}
        style={{
          backgroundColor: "#3d644a",
          color: "#ffffff",
          padding: "14px 20px",
          borderRadius: "6px",
        }}
      >
        {t(`${message.kind}Action`)}
      </Button>
    </EmailLayout>
  );
};

export const renderReviewerEmail = async (message: ReviewerMessage) => {
  const instance = createMessages({ reviewerEmail: en });
  const html = await render(
    <ServerMessagesProvider instance={instance} locale={defaultLocale}>
      <ReviewerEmail message={message} />
    </ServerMessagesProvider>,
  );
  return {
    subject: instance.getFixedT("en", "reviewerEmail")(`${message.kind}Subject`, {
      title: message.title,
    }),
    html,
    text: toPlainText(html),
  };
};
