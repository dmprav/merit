import { Button, Heading, Hr, Link, Section, Text } from "react-email";
import { Trans, useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n/server";
import type { InvitationMessage } from "@merit/organizations/api";

import { EmailLayout } from "../../app/layout";

export const InvitationEmail = (message: InvitationMessage) => {
  const { t, i18n } = useTranslation("invitationEmail");
  const locale = useLocaleSettings();
  const expiry = new Intl.DateTimeFormat(locale.formatLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(message.expiresAt);

  return (
    <EmailLayout
      preview={t("preview", { organizationName: message.organizationName })}
      language={locale.language}
      direction={i18n.dir(locale.language)}
    >
      <Heading
        as="h1"
        className="email-heading"
        style={{
          fontSize: "36px",
          lineHeight: "42px",
          fontWeight: 600,
          letterSpacing: "-1.2px",
          overflowWrap: "anywhere",
          margin: "0 0 16px",
        }}
      >
        {t("title", { organizationName: message.organizationName })}
      </Heading>
      <Text style={{ color: "#59665d", fontSize: "17px", lineHeight: "27px", margin: "0 0 28px" }}>
        {t("introduction")}
      </Text>
      <InvitationResponsibilities {...message} />
      <Text
        style={{
          fontSize: "15px",
          lineHeight: "24px",
          overflowWrap: "anywhere",
          margin: "0 0 20px",
        }}
      >
        <Trans
          t={t}
          i18nKey="recipient"
          values={{ email: message.to }}
          components={{ recipient: <strong style={{ fontWeight: 600 }} /> }}
        />
      </Text>
      <Button
        href={message.url}
        style={{
          backgroundColor: "#3d644a",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "16px",
          fontWeight: 500,
          padding: "16px 24px",
          textDecoration: "none",
        }}
      >
        {t("review")}
      </Button>
      <Text style={{ color: "#59665d", fontSize: "13px", lineHeight: "20px", margin: "12px 0 0" }}>
        {t("expiry", { date: expiry })}
      </Text>
      <Hr style={{ borderTop: "1px solid #d9dfd5", margin: "32px 0 20px" }} />
      <Text
        style={{
          color: "#59665d",
          fontSize: "13px",
          lineHeight: "20px",
          margin: 0,
          overflowWrap: "anywhere",
          wordBreak: "break-all",
        }}
      >
        {t("fallbackLink")}
        <br />
        <Link href={message.url} style={{ color: "#3d644a", textDecoration: "underline" }}>
          {message.url}
        </Link>
      </Text>
      <Text style={{ color: "#59665d", fontSize: "13px", lineHeight: "20px", margin: "20px 0 0" }}>
        {t("unexpected")}
      </Text>
    </EmailLayout>
  );
};

const InvitationResponsibilities = (
  message: Pick<InvitationMessage, "administration" | "role">,
) => {
  const { t } = useTranslation("invitationEmail");
  return (
    <Section
      style={{
        backgroundColor: "#e8eee4",
        borderRadius: "8px",
        padding: "24px",
        margin: "0 0 28px",
      }}
    >
      <Heading
        as="h2"
        style={{ fontSize: "16px", lineHeight: "24px", fontWeight: 600, margin: "0 0 20px" }}
      >
        {t("responsibilities")}
      </Heading>
      <Text style={{ color: "#59665d", fontSize: "13px", lineHeight: "20px", margin: "0 0 4px" }}>
        {t("administration.label")}
      </Text>
      <Text style={{ fontSize: "16px", lineHeight: "24px", fontWeight: 500, margin: 0 }}>
        {t(`administration.${message.administration}`)}
      </Text>
      <Hr style={{ borderTop: "1px solid #ced8ca", margin: "16px 0" }} />
      <Text style={{ color: "#59665d", fontSize: "13px", lineHeight: "20px", margin: "0 0 4px" }}>
        {t("grantWork.label")}
      </Text>
      <Text style={{ fontSize: "16px", lineHeight: "24px", fontWeight: 500, margin: 0 }}>
        {t(`grantWork.${message.role}`)}
      </Text>
    </Section>
  );
};
