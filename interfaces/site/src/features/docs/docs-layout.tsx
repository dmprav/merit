import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "@merit/ui/icon";

import { SiteShell } from "../../app/site-shell";
import { docsGroups, docsPages, type DocsPage } from "./docs-navigation";
import styles from "./docs.module.css";
import { useActiveDocSection } from "./use-active-doc-section";

export const DocsLayout = ({ page, children }: { page: DocsPage; children: ReactNode }) => (
  <SiteShell variant="docs">
    <DocsFrame page={page}>{children}</DocsFrame>
  </SiteShell>
);

const DocsNavigation = ({ page }: { page: DocsPage }) => {
  const { t } = useTranslation("site");

  return (
    <nav aria-label={t("docs.navigation")} className={styles.navigation}>
      {docsGroups.map((group) => (
        <div key={group} className={styles.navGroup}>
          <p className={styles.navHeading}>{t(`docs.groups.${group}`)}</p>
          {Object.entries(docsPages)
            .filter(([, entry]) => entry.group === group)
            .map(([id, entry]) => (
              <Link
                key={id}
                to={entry.to}
                activeOptions={{ exact: true }}
                aria-current={id === page ? "page" : undefined}
                className={styles.navLink}
              >
                {id === "overview" ? t("docs.overview") : t(`docs.pages.${id as DocsPage}.title`)}
              </Link>
            ))}
        </div>
      ))}
    </nav>
  );
};

const DocsFrame = ({ page, children }: { page: DocsPage; children: ReactNode }) => {
  const { t } = useTranslation("site");

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <DocsNavigation page={page} />
      </aside>
      <details className={styles.mobileNavigation} key={page}>
        <summary>
          <Icon name="right" className={styles.disclosureIcon} />
          {t("docs.browse")}
          <span>{t(`docs.pages.${page}.title`)}</span>
        </summary>
        <DocsNavigation page={page} />
      </details>
      <div className={styles.content}>{children}</div>
    </div>
  );
};

export type DocSection = { id: string; title: string; children: ReactNode };

export const DocsArticle = ({
  page,
  sections,
  children,
  next,
}: {
  page: DocsPage;
  sections: DocSection[];
  children?: ReactNode;
  next?: DocsPage;
}) => {
  const { t } = useTranslation("site");
  const { articleRef, activeSection, setActiveSection } = useActiveDocSection(page);

  const contents = (
    <ul>
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            aria-current={activeSection === section.id ? "location" : undefined}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              const details = event.currentTarget.closest("details");
              if (details) {
                details.open = false;
              }
              document.getElementById(section.id)?.focus({ preventScroll: true });
              setActiveSection(section.id);
            }}
          >
            {section.title}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.articleLayout}>
      <article ref={articleRef} className={styles.article}>
        <header>
          <h1 className={styles.title}>{t(`docs.pages.${page}.title`)}</h1>
          <p className={styles.introduction}>{t(`docs.pages.${page}.description`)}</p>
        </header>
        <details className={styles.mobileContents}>
          <summary>
            <Icon name="right" className={styles.disclosureIcon} />
            {t("docs.contents")}
          </summary>
          <nav aria-label={t("docs.contents")}>{contents}</nav>
        </details>
        {children}
        {sections.map((section) => (
          <section key={section.id} className={styles.section} aria-labelledby={section.id}>
            <h2 id={section.id} tabIndex={-1} className={styles.sectionTitle}>
              {section.title}
              <a
                href={`#${section.id}`}
                aria-label={t("docs.sectionLink", { title: section.title })}
                className={styles.anchor}
              >
                #
              </a>
            </h2>
            {section.children}
          </section>
        ))}
        {next && (
          <Link to={docsPages[next].to} className={styles.next}>
            <span>
              <small>{t("docs.next")}</small>
              {t(`docs.pages.${next}.title`)}
            </span>
            <Icon name="forward" />
          </Link>
        )}
      </article>
      <aside className={styles.toc}>
        <nav aria-label={t("docs.contents")}>
          <p>{t("docs.contents")}</p>
          {contents}
        </nav>
      </aside>
    </div>
  );
};

export const DemoLink = () => {
  const { t } = useTranslation("site");
  return (
    <Link to="/demo/workshop-saturdays" className={styles.textLink}>
      {t("docs.shared.tryExample")} <Icon name="forward" />
    </Link>
  );
};
