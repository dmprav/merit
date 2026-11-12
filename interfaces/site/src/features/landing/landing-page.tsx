import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import { getExampleRound } from "@merit/grantmaking/examples";
import { useLocaleSettings } from "@merit/i18n";
import { formatMoney } from "@merit/money";
import { RequestAccess } from "@merit/product/access-request";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { PopoverDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import linkStyles from "@merit/ui/link.module.css";
import { Tooltip } from "@merit/ui/tooltip";

import styles from "./landing-page.module.css";
import { createLandingPreview, type LandingPreview } from "./landing-preview";
import { positionKeys } from "./recommendation-labels";
import { RoundPreview } from "./round-preview";

const preview = createLandingPreview(getExampleRound());

export const LandingPage = () => (
  <div className={styles.landing}>
    <Hero round={preview.round} />
    <EvidenceComparison comparison={preview.comparison} />
    <Invitation />
  </div>
);

const DemoLink = () => {
  const { t } = useTranslation("site");
  return (
    <Link to="/demo" className={linkStyles.button} data-variant="primary" data-size="large">
      {t("navigation.demo")} <Icon name="forward" />
    </Link>
  );
};

const Hero = ({ round }: { round: LandingPreview["round"] }) => {
  const { t } = useTranslation(["site", "common"]);
  const [projectNoteOpen, setProjectNoteOpen] = useState(false);

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.introduction}>
        <div className={styles.heroTitle}>
          <h1 id="hero-title" className={styles.titleText}>
            {t("hero.title")}
          </h1>
          <PopoverDialog
            title={t("hero.projectLabel")}
            closeLabel={t("common:closeDialog")}
            isOpen={projectNoteOpen}
            onOpenChange={setProjectNoteOpen}
            placement="bottom start"
            trigger={
              <Tooltip
                content={t("hero.projectDescription")}
                placement="top"
                isDisabled={projectNoteOpen}
              >
                <Button
                  variant="quiet"
                  size="small"
                  iconOnly
                  aria-label={t("hero.projectLabel")}
                  className={styles.projectNote}
                >
                  <span className={styles.asterisk} aria-hidden="true">
                    *
                  </span>
                </Button>
              </Tooltip>
            }
          >
            <p>{t("hero.projectDescription")}</p>
          </PopoverDialog>
        </div>
        <p className={styles.description}>{t("hero.description")}</p>
        <div className={styles.action}>
          <DemoLink />
          <p className={styles.demoNote}>{t("hero.demoNote")}</p>
        </div>
      </div>
      <RoundPreview round={round} className={styles.productPreview} />
      <div className={styles.overview}>
        {(["progress", "budget"] as const).map((benefit) => (
          <div key={benefit}>
            <h2>{t(`overview.${benefit}.title`)}</h2>
            <p>{t(`overview.${benefit}.description`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const EvidenceComparison = ({ comparison }: { comparison: LandingPreview["comparison"] }) => {
  const { t } = useTranslation("site");
  const { formatLocale } = useLocaleSettings();
  const { application, assessment } = comparison;

  return (
    <section className={styles.evidenceSection} aria-labelledby="evidence-title">
      <header className={styles.sectionHeading}>
        <h2 id="evidence-title">{t("workflow.title")}</h2>
        <p>{t("workflow.description")}</p>
      </header>
      <div className={styles.comparison}>
        <article className={styles.detailPanel} aria-labelledby="application-title">
          <header className={styles.detailHeading}>
            <h3 id="application-title">{application.title}</h3>
            <p className={styles.meta}>{t("preview.version", { version: application.version })}</p>
          </header>
          <blockquote className={styles.evidence}>
            <HighlightedText
              text={application.passage}
              highlight={t("workflow.applicationHighlight")}
            />
          </blockquote>
        </article>
        <article className={styles.detailPanel} aria-labelledby="assessment-title">
          <header className={styles.detailHeading}>
            <h3 id="assessment-title">{t("preview.assessments")}</h3>
            <p className={styles.meta}>
              {t("preview.reviewedVersion", { version: assessment.applicationVersion })}
            </p>
          </header>
          <blockquote className={styles.reviewReason}>
            <HighlightedText
              text={assessment.reasoning}
              highlight={t("workflow.reviewHighlight")}
            />
          </blockquote>
          <footer className={styles.assessmentDetails}>
            <p className={styles.meta}>{assessment.reviewer}</p>
            <div className={styles.reviewOutcome}>
              <p>
                {assessment.recommendation.position === null
                  ? t("preview.notStated")
                  : t(positionKeys[assessment.recommendation.position])}
              </p>
              <p>
                {t("preview.proposed")}:{" "}
                {assessment.recommendation.allocation === null
                  ? t("preview.notStated")
                  : formatMoney(assessment.recommendation.allocation, formatLocale)}
              </p>
              <Badge tone="warning">{t("preview.changed")}</Badge>
            </div>
          </footer>
        </article>
      </div>
      <p className={styles.takeaway}>{t("workflow.takeaway")}</p>
    </section>
  );
};

const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) =>
  text.split(highlight).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <mark className={styles.highlight}>{highlight}</mark>}
      {part}
    </Fragment>
  ));

const Invitation = () => {
  const { t } = useTranslation("site");

  return (
    <section className={styles.invitation} aria-labelledby="invitation-title">
      <div>
        <h2 id="invitation-title">{t("invitation.title")}</h2>
        <p className={styles.invitationDescription}>{t("invitation.description")}</p>
      </div>
      <div className={styles.invitationActions}>
        <DemoLink />
        <div className={styles.invitationRequest}>
          <p>{t("invitation.request")}</p>
          <RequestAccess />
        </div>
      </div>
    </section>
  );
};
