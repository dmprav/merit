import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { AiReviewEntry } from "@merit/reviews/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Disclosure } from "@merit/ui/disclosure";
import { Divider } from "@merit/ui/divider";
import { Icon } from "@merit/ui/icon";
import { Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { OutcomeSummary } from "@merit/ui/outcome-summary";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";

import { reviewPositionKeys } from "../reviews/assessment-outcome";
import { AiReviewBasis, AiReviewBasisNotice } from "./ai-review-basis";
import styles from "./ai-review.module.css";
import type { AiReviewWork } from "./use-ai-review-work";

type Section = AiReviewEntry["criteria"][number];

type Listed = "gaps" | "strengths" | "weaknesses" | "concerns";

const listed: readonly Listed[] = ["gaps", "strengths", "weaknesses", "concerns"];

/** The selected AI review in full, with the earlier runs of the application beneath the latest. */
export const AiReviewContent = ({
  work,
  onInspectVersion,
}: {
  work: AiReviewWork;
  onInspectVersion?: (version: number) => void;
}) => {
  const { t } = useTranslation("aiReview");
  const { calendarDate } = useFormat();
  const { reading, reviews } = work;
  const { selected, previous, root, heading, back, openEarlier } = reading;
  const [earlierOpen, setEarlierOpen] = useState(false);
  if (!selected) {
    return null;
  }
  const earlier = selected.id === reviews[0]?.id ? reviews.slice(1) : [];

  return (
    <section ref={root} aria-label={t("details.label")} className={styles.content}>
      <div className={styles.header}>
        <Button variant="quiet" alignment="start" onPress={back}>
          <Icon name="left" />
          {t(previous ? "backReview" : "back")}
        </Button>
        <SectionHeader headingRef={heading} title={t("title")} />
        <PersonIdentity
          name={t("author")}
          nameAs="h3"
          description={t("entryMeta", {
            date: calendarDate(selected.recordedAt.slice(0, 10)),
            model: selected.model,
          })}
        />
      </div>
      <Outcome review={selected} />
      <AiReviewBasisNotice review={selected} onInspectVersion={onInspectVersion} />
      <Notice appearance="inline" tone="neutral">
        {t("details.note")}
      </Notice>
      <Stack gap={2}>
        <SectionHeader level={3} title={t("details.reasoning")} />
        <Reading as="p">{selected.reasoning}</Reading>
      </Stack>
      {selected.criteria.map((section, index) => (
        <CriterionSection key={index} section={section} />
      ))}
      <Stack gap={2}>
        <SectionHeader level={3} title={t("details.questions")} />
        {selected.questions.length ? (
          <ol aria-label={t("details.questions")} className={styles.list}>
            {selected.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ol>
        ) : (
          <Text as="p" variant="missing">
            {t("details.noQuestions")}
          </Text>
        )}
      </Stack>
      <RunDetails review={selected} />
      {earlier.length > 0 && (
        <div className={styles.earlier}>
          <Disclosure
            title={t("earlier")}
            count={earlier.length}
            isExpanded={earlierOpen}
            onExpandedChange={setEarlierOpen}
          >
            <Timeline label={t("earlier")}>
              {earlier.map((review) => (
                <EarlierRun key={review.id} review={review} onOpen={openEarlier} />
              ))}
            </Timeline>
          </Disclosure>
        </div>
      )}
    </section>
  );
};

/** Who ran it, with what, and on which material, as a recorded assessment's details do. */
const RunDetails = ({ review }: { review: AiReviewEntry }) => {
  const { t } = useTranslation("aiReview");
  const { formatLocale } = useLocaleSettings();
  return (
    <section aria-label={t("details.runDetails")}>
      <DescriptionList layout="rows">
        <DescriptionListItem label={t("details.model")}>{review.model}</DescriptionListItem>
        <DescriptionListItem label={t("details.provider")}>{review.provider}</DescriptionListItem>
        <DescriptionListItem label={t("details.runOn")}>
          <time dateTime={review.recordedAt}>
            {new Date(review.recordedAt).toLocaleString(formatLocale, {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            })}{" "}
            UTC
          </time>
        </DescriptionListItem>
        <DescriptionListItem label={t("details.runBy")}>{review.runBy.name}</DescriptionListItem>
        <DescriptionListItem label={t("details.via")}>
          <ActionProvenance value={review.provenance} detail />
        </DescriptionListItem>
        <DescriptionListItem label={t("details.submission")}>
          {t("details.version", { version: review.applicationVersion })}
        </DescriptionListItem>
        <DescriptionListItem label={t("details.criteria")}>
          {t("details.version", { version: review.criteriaVersion })}
        </DescriptionListItem>
      </DescriptionList>
    </section>
  );
};

const Outcome = ({ review }: { review: AiReviewEntry }) => {
  const { t } = useTranslation(["aiReview", "reviewGrant"]);
  const { money } = useFormat();
  return (
    <OutcomeSummary
      title={t(reviewPositionKeys[review.position], { ns: "reviewGrant" })}
      detail={
        review.position === "Defer" || review.position === "Decline"
          ? t("noFunding")
          : t("proposed", { amount: money(decodeMoney(review.amount)) })
      }
    />
  );
};

const CriterionSection = ({ section }: { section: Section }) => {
  const { t } = useTranslation("aiReview");
  return (
    <section className={styles.criterion} aria-label={section.title}>
      <Divider />
      <SectionHeader level={3} title={section.title} />
      {section.claims.length > 0 && (
        <div className={styles.group}>
          <SectionHeader level={4} emphasis="quiet" title={t("section.claims")} />
          <ul className={styles.claims}>
            {section.claims.map((claim, index) => (
              <li key={index} className={styles.claim}>
                <Reading as="p" prose={false}>
                  {claim.text}
                </Reading>
                {claim.citations.map((citation, position) => (
                  <Citation key={position} citation={citation} />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {listed.map(
        (kind) =>
          section[kind].length > 0 && (
            <div key={kind} className={styles.group}>
              <SectionHeader level={4} emphasis="quiet" title={t(`section.${kind}`)} />
              <ul className={styles.list}>
                {section[kind].map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ),
      )}
    </section>
  );
};

/** A verbatim excerpt of the application, labelled with the field or question it came from. */
const Citation = ({ citation }: { citation: Section["claims"][number]["citations"][number] }) => {
  const { t } = useTranslation("aiReview");
  const fields = ["title", "applicant", "requested", "projectPeriod", "submittedOn"] as const;
  const field = fields.find((name) => name === citation.source);
  const source = field ? t(`citation.${field}`) : (citation.label ?? t("citation.question"));
  return (
    <figure className={styles.quote}>
      <blockquote>
        <p>“{citation.quote}”</p>
      </blockquote>
      <Text as="div" variant="caption">
        <figcaption>{t("citation.from", { source })}</figcaption>
      </Text>
    </figure>
  );
};

const EarlierRun = ({
  review,
  onOpen,
}: {
  review: AiReviewEntry;
  onOpen: (id: string) => void;
}) => {
  const { t } = useTranslation(["aiReview", "reviewGrant"]);
  const { money, calendarDate } = useFormat();
  return (
    <TimelineEntry
      title={t("entryMeta", {
        date: calendarDate(review.recordedAt.slice(0, 10)),
        model: review.model,
      })}
    >
      <div className={styles.earlierEntry}>
        <div className={styles.earlierSummary}>
          <strong>{t(reviewPositionKeys[review.position], { ns: "reviewGrant" })}</strong>
          <span>{t("proposed", { amount: money(decodeMoney(review.amount)) })}</span>
        </div>
        <Text as="div" variant="caption">
          <span>{t("runBySummary", { name: review.runBy.name })}</span>
          {" · "}
          <AiReviewBasis review={review} />
        </Text>
        <div>
          <Button
            variant="quiet"
            alignment="start"
            data-ai-review={review.id}
            onPress={() => onOpen(review.id)}
          >
            {t("open")}
            <Icon name="right" />
          </Button>
        </div>
      </div>
    </TimelineEntry>
  );
};
