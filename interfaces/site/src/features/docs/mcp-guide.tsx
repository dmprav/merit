import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";
import localStyles from "./mcp-guide.module.css";

export const McpGuide = () => {
  const { t } = useTranslation("site");
  const [origin, setOrigin] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const endpoint = origin ? `${origin}/mcp/workspace` : t("docs.pages.mcp.connect.origin");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("copyFailed");
    }
  };

  return (
    <DocsArticle
      page="mcp"
      next="quickstart"
      sections={[
        {
          id: "connect",
          title: t("docs.pages.mcp.connect.title"),
          children: (
            <>
              <p>{t("docs.pages.mcp.connect.body")}</p>
              <div className={localStyles.endpoint}>
                <code>{endpoint}</code>
                <Button variant="secondary" size="small" onPress={copy} isDisabled={!origin}>
                  <Icon name="copy" />
                  {t("docs.pages.mcp.connect.copy")}
                </Button>
              </div>
              <p role="status" className={localStyles.copyStatus}>
                {copyStatus ? t(`docs.pages.mcp.connect.${copyStatus}`) : ""}
              </p>
            </>
          ),
        },
        {
          id: "first-request",
          title: t("docs.pages.mcp.request.title"),
          children: (
            <>
              <h3>{t("docs.pages.mcp.request.staffTitle")}</h3>
              <blockquote className={styles.example}>
                {t("docs.pages.mcp.request.prompt")}
              </blockquote>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.mcp.request.tool"
                  components={{ tool: <code /> }}
                />
              </p>
              <h3>{t("docs.pages.mcp.request.reviewerTitle")}</h3>
              <blockquote className={styles.example}>
                {t("docs.pages.mcp.request.reviewerPrompt")}
              </blockquote>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.mcp.request.reviewerTool"
                  components={{ tool: <code /> }}
                />
              </p>
            </>
          ),
        },
        {
          id: "result",
          title: t("docs.pages.mcp.result.title"),
          children: (
            <>
              <p>{t("docs.pages.mcp.result.body")}</p>
              <p>{t("docs.pages.mcp.result.money")}</p>
              <p className={styles.note} data-tone="warning">
                {t("docs.pages.mcp.result.saving")}
              </p>
            </>
          ),
        },
        {
          id: "workspace-mcp",
          title: t("docs.pages.mcp.workspace.title"),
          children: <ClientAccess />,
        },
        {
          id: "troubleshooting",
          title: t("docs.pages.mcp.troubleshooting.title"),
          children: <p>{t("docs.pages.mcp.troubleshooting.body")}</p>,
        },
      ]}
    />
  );
};

const ClientAccess = () => {
  const { t } = useTranslation("site");

  return (
    <>
      <p>{t("docs.pages.mcp.workspace.availability")}</p>
      <p>{t("docs.pages.mcp.workspace.auth")}</p>
      <table className={`${styles.table} ${localStyles.accessTable}`}>
        <thead>
          <tr>
            <th scope="col">{t("docs.pages.mcp.workspace.task")}</th>
            <th scope="col">{t("docs.pages.mcp.workspace.grants")}</th>
          </tr>
        </thead>
        <tbody>
          {(["work", "team", "reviews", "profile", "onboarding", "admin"] as const).map((key) => (
            <tr key={key}>
              <th scope="row">{t(`docs.pages.mcp.workspace.scopes.${key}`)}</th>
              <td>{t(`docs.pages.mcp.workspace.scopes.${key}Grants`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
