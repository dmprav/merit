import type { ReactNode, Ref, ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import type { ReviewBasis } from "@merit/reviews/domain";
import {
  compareCriteriaContent,
  compareReviewBasis,
  reviewFreshness,
  type ReviewState,
} from "@merit/reviews/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";

import type { ReviewApplication, ReviewRound } from "../../contracts/reviews";
import { AssessmentOutcome } from "./assessment-outcome";
import { RequestDetails } from "./request-details";
import styles from "./review-work.module.css";
import type { ReviewReading, ReviewInspection } from "./use-review-reading";

const RecordedAssessment = ({
  version,
  applicationVersion,
  criteria,
  criteriaVersion,
  onInspectVersion,
  onInspectCriteria,
  criteriaAction,
  detailed = false,
}: {
  detailed?: boolean;
  onInspectCriteria?: () => void;
  criteriaAction?: string;
  version: ReviewState["assessments"][number]["versions"][number];
  applicationVersion: NonNullable<ReviewBasis["applicationVersion"]>;
  criteriaVersion: NonNullable<ReviewBasis["criteriaVersion"]>;
  criteria: NonNullable<ReviewRound["criteria"]>;
  onInspectVersion?: (version: ReviewApplication["version"]) => void;
}) => {
  const { t } = useTranslation("reviews");
  const { content } = version;
  const amount = content.amount === null ? null : parseMoney(content.amount);

  return (
    <>
      <AssessmentOutcome position={content.position} amount={amount?.ok ? amount.value : null} />
      <AssessmentBasisNotice
        version={version}
        applicationVersion={applicationVersion}
        criteriaVersion={criteriaVersion}
        criteria={criteria}
        onInspectVersion={onInspectVersion}
      />
      <p className={styles.reasoning}>{content.reasoning}</p>
      {detailed &&
        content.observations
          .filter((observation) => observation.text.trim())
          .map((observation, index) => (
            <div key={index} className={styles.reasoning}>
              <strong>{observation.criterion}</strong>
              <p>{observation.text}</p>
            </div>
          ))}
      {detailed ? (
        <AssessmentDetails
          version={version}
          onInspectCriteria={onInspectCriteria}
          criteriaAction={criteriaAction}
        />
      ) : (
        <p className={styles.meta}>
          {content.date ? <AssessmentDate date={content.date} /> : t("dateUnknown")}
          {content.applicationVersion === applicationVersion && (
            <> · {t("reviewedVersion", { version: content.applicationVersion })}</>
          )}
        </p>
      )}
    </>
  );
};

const AssessmentBasisNotice = ({
  version,
  applicationVersion,
  criteriaVersion,
  criteria,
  onInspectVersion,
}: ComponentProps<typeof RecordedAssessment>) => {
  const { t } = useTranslation("reviews");
  const { content } = version;
  const basis = compareReviewBasis(
    { ...content, criteria: version.criteria },
    { applicationVersion, criteriaVersion, criteria },
  );
  return (
    <>
      {reviewFreshness(basis) !== "current" && (
        <Inline className={styles.reviewBasis}>
          {basis.applicationVersion === "different" && (
            <>
              <span>{t("earlierSubmission")}</span>
              {onInspectVersion && (
                <Button
                  variant="quiet"
                  size="small"
                  onPress={() => onInspectVersion(content.applicationVersion!)}
                >
                  {t("compareChanges")}
                </Button>
              )}
            </>
          )}
          {basis.criteriaContent === "different" && <span>{t("criteriaChanged")}</span>}
          {(basis.applicationVersion === "unknown" || basis.criteriaContent === "unknown") && (
            <span>
              {t(
                basis.applicationVersion === "unknown" && basis.criteriaContent === "unknown"
                  ? "basisUnknown"
                  : basis.applicationVersion === "unknown"
                    ? "applicationBasisUnknown"
                    : "criteriaBasisUnknown",
              )}
            </span>
          )}
        </Inline>
      )}
    </>
  );
};

const AssessmentDetails = ({
  version,
  onInspectCriteria,
  criteriaAction,
}: {
  criteriaAction?: string;
  version: ReviewState["assessments"][number]["versions"][number];
  onInspectCriteria?: () => void;
}) => {
  const { t } = useTranslation("reviews");
  const { formatLocale } = useLocaleSettings();
  const { calendarDate } = useFormat();
  const { content } = version;

  return (
    <section className={styles.reviewDetails} aria-label={t("inspectBasis")}>
      <dl className={styles.detailFacts}>
        <dt>{t("assessmentDate")}</dt>
        <dd>{content.date ? calendarDate(content.date) : t("unknown")}</dd>
        <dt>{t("recordedByLabel")}</dt>
        <dd>{version.recorder?.name ?? t("unknown")}</dd>
        {version.recorder && (
          <>
            <dt>{t("recordedAtLabel")}</dt>
            <dd>
              <time dateTime={version.recorder.recordedAt}>
                {new Date(version.recorder.recordedAt).toLocaleString(formatLocale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>
            </dd>
            <dt>{t("recordedThrough")}</dt>
            <dd>
              <ActionProvenance value={version.recorder.provenance} />
            </dd>
          </>
        )}
        <dt>{t("submission")}</dt>
        <dd>
          {content.applicationVersion === null
            ? t("unknown")
            : t("version", { version: content.applicationVersion })}
        </dd>
        <dt>{t("criteriaVersion")}</dt>
        <dd>
          {content.criteriaVersion === null
            ? t("unknown")
            : t("version", { version: content.criteriaVersion })}
        </dd>
      </dl>
      {version.note && (
        <div>
          <strong>{t("note")}</strong>
          <p className={styles.reasoning}>{version.note}</p>
        </div>
      )}
      <Button
        variant="quiet"
        size="small"
        alignment="start"
        data-review-action={criteriaAction}
        onPress={onInspectCriteria}
      >
        {t("criteriaUsed")} <Icon name="right" />
      </Button>
    </section>
  );
};

const AssessmentCriteria = ({
  version,
  criteria,
  criteriaVersion,
}: {
  version: ReviewState["assessments"][number]["versions"][number];
  criteria: ReviewRound["criteria"];
  criteriaVersion: ReviewRound["criteriaVersion"];
}) => {
  const { t } = useTranslation("reviews");
  return (
    <div className={styles.reviewDetails}>
      <section aria-label={t("originalCriteria")} className={styles.detailCriteria}>
        <p className={styles.meta}>
          {version.content.criteriaVersion === null
            ? t("criteriaBasisUnknown")
            : t("version", { version: version.content.criteriaVersion })}
        </p>
        <CriteriaRecord criteria={version.criteria} />
      </section>
      {compareCriteriaContent(version.criteria, criteria) === "different" && (
        <section aria-label={t("latestCriteria")} className={styles.detailCriteria}>
          <h3>{t("latestCriteria")}</h3>
          <p className={styles.meta}>{t("version", { version: criteriaVersion })}</p>
          <CriteriaRecord criteria={criteria} />
        </section>
      )}
    </div>
  );
};

const CriteriaRecord = ({
  criteria,
}: {
  criteria: ReviewState["assessments"][number]["versions"][number]["criteria"];
}) => {
  const { t } = useTranslation("reviews");
  return criteria === null ? (
    <p className={styles.meta}>{t("unknown")}</p>
  ) : (
    <dl>
      {criteria.map((item, index) => (
        <div key={index}>
          <dt>{item.title}</dt>
          {item.description && <dd>{item.description}</dd>}
        </div>
      ))}
    </dl>
  );
};

type ReviewContentProps = {
  application: ReviewApplication;
  round: ReviewRound;
  title?: string;
  headerActions?: ReactNode;
  feedback?: ReactNode;
  assessmentActions?: (assessment: ReviewState["assessments"][number]) => ReactNode;
  requestActions?: (request: ReviewState["requests"][number]) => ReactNode;
  reading: ReviewReading;
  onInspectVersion?: (version: ReviewApplication["version"]) => void;
};

export const ReviewContent = ({
  application,
  round,
  title,
  headerActions,
  feedback,
  assessmentActions,
  requestActions,
  reading,
  onInspectVersion,
}: ReviewContentProps) => {
  const { t } = useTranslation("reviews");
  const { inspection, previous, root, heading, inspect, back } = reading;
  const focusedId = inspection && "id" in inspection ? inspection.id : undefined;
  const state = application.reviews;
  const { latest, pending } = reviewEntries(state, focusedId);

  return (
    <section ref={root} aria-label={title ?? t("title")} className={styles.reviews}>
      <ReviewReadingHeader
        title={title}
        inspection={inspection}
        previous={previous}
        heading={heading}
        back={back}
        count={latest.length}
        actions={headerActions}
      />
      {feedback}
      {inspection?.kind === "requests" ? (
        <ReviewRequestHistory requests={state.requests} />
      ) : inspection?.kind === "criteria" ? (
        <>
          {latest[0] && <PersonIdentity name={latest[0].reviewer} nameAs="h3" />}
          <AssessmentCriteria
            version={inspection.version}
            criteria={round.criteria}
            criteriaVersion={round.criteriaVersion}
          />
        </>
      ) : (
        <AssessmentList
          application={application}
          round={round}
          entries={{ latest, pending }}
          focusedId={focusedId}
          inspection={inspection}
          inspect={inspect}
          assessmentActions={assessmentActions}
          requestActions={requestActions}
          onInspectVersion={onInspectVersion}
        />
      )}
    </section>
  );
};

const AssessmentList = ({
  application,
  round,
  entries: { latest, pending },
  focusedId,
  inspection,
  inspect,
  assessmentActions,
  requestActions,
  onInspectVersion,
}: Pick<
  ReviewContentProps,
  "application" | "round" | "assessmentActions" | "requestActions" | "onInspectVersion"
> & {
  entries: ReturnType<typeof reviewEntries>;
  focusedId?: string;
  inspection: ReviewInspection | null;
  inspect: (inspection: ReviewInspection) => void;
}) => {
  const { t } = useTranslation("reviews");
  const state = application.reviews;
  return (
    <>
      {focusedId && !latest.length && !pending.length && <p>{t("selectedUnavailable")}</p>}
      {!focusedId && !state.assessments.length && !state.requests.length && <p>{t("noReviews")}</p>}
      {latest.map((assessment) => (
        <AssessmentEntry
          key={assessment.id}
          assessment={assessment}
          application={application}
          round={round}
          assessmentActions={assessmentActions}
          detailed={Boolean(inspection)}
          showHistory={inspection?.kind === "history"}
          onDetails={() => inspect({ kind: "assessment", id: assessment.id })}
          onHistory={() => inspect({ kind: "history", id: assessment.id })}
          onInspectCriteria={(version) => inspect({ kind: "criteria", id: assessment.id, version })}
          onInspectVersion={onInspectVersion}
        />
      ))}
      {pending.length > 0 && (
        <PendingRequests
          pending={pending}
          focusedId={focusedId}
          application={application}
          round={round}
          requestActions={requestActions}
        />
      )}
      {!focusedId && state.requests.length > 0 && (
        <Button
          size="small"
          variant="quiet"
          alignment="start"
          data-review-action="requests"
          onPress={() => inspect({ kind: "requests" })}
        >
          {t("requestHistory")} <span className={styles.meta}>{state.requests.length}</span>
        </Button>
      )}
    </>
  );
};

const ReviewReadingHeader = ({
  title,
  inspection,
  previous,
  heading,
  back,
  count,
  actions,
}: {
  title?: string;
  inspection: ReviewInspection | null;
  previous: ReviewInspection | null;
  heading: Ref<HTMLHeadingElement>;
  back: () => void;
  count: number;
  actions?: ReactNode;
}) => {
  const { t } = useTranslation("reviews");
  if (inspection) {
    return (
      <>
        <Button size="small" variant="quiet" alignment="start" onPress={back}>
          <Icon name="left" />
          {t(inspectionReturnLabel(previous))}
        </Button>
        <h2 ref={heading} tabIndex={-1}>
          {t(inspectionTitle(inspection))}
        </h2>
      </>
    );
  }
  return (
    <SectionHeader
      title={title ?? t("title")}
      className={styles.reviewHeader}
      count={count || undefined}
      aside={actions}
    />
  );
};

const inspectionReturnLabel = (previous: ReviewInspection | null) => {
  if (previous?.kind === "history") {
    return "backHistory";
  }
  return previous?.kind === "assessment" || previous?.kind === "review"
    ? "backAssessment"
    : "backReviews";
};

const inspectionTitle = (inspection: ReviewInspection) =>
  (
    {
      review: "assessmentTitle",
      requests: "requestHistory",
      criteria: "originalCriteria",
      history: "assessmentHistory",
      assessment: "inspectBasis",
    } as const
  )[inspection.kind];

const reviewEntries = (state: ReviewState, focusedId: string | undefined) => {
  const superseded = new Set(
    state.assessments.flatMap((item) => (item.previousId ? [item.previousId] : [])),
  );
  const latest = state.assessments.filter(
    (item) => !superseded.has(item.id) && (!focusedId || item.id === focusedId),
  );
  const pending = state.requests.filter(
    (request) => request.status === "outstanding" && (!focusedId || request.id === focusedId),
  );
  return { latest, pending };
};

const PendingRequests = ({
  pending,
  focusedId,
  application,
  round,
  requestActions,
}: Pick<ReviewContentProps, "application" | "round" | "requestActions"> & {
  focusedId?: string;
  pending: ReviewState["requests"];
}) => {
  const { t } = useTranslation("reviews");
  return (
    <Stack as="section" gap={3} aria-label={t("awaitingTitle")}>
      {!focusedId && (
        <SectionHeader
          title={t("awaitingTitle")}
          count={pending.length}
          className={styles.reviewHeader}
        />
      )}
      {pending.map((request) => {
        const basis = compareReviewBasis(request, {
          applicationVersion: application.version,
          criteriaVersion: round.criteriaVersion,
          criteria: round.criteria,
        });
        const freshness = reviewFreshness(basis);
        return (
          <article key={request.id} aria-label={request.reviewer} className={styles.pendingRow}>
            <div className={styles.requestPerson}>
              <PersonIdentity name={request.reviewer} description={t("outstanding")} />
              {focusedId && <RequestDetails request={request} />}
              {freshness === "outdated" ? (
                <p className={styles.requestChange}>{t("requestChanged")}</p>
              ) : (
                freshness === "unknown" && (
                  <p className={styles.requestChange}>{t("basisUnknown")}</p>
                )
              )}
            </div>
            {requestActions?.(request)}
          </article>
        );
      })}
    </Stack>
  );
};

const AssessmentEntry = ({
  assessment,
  application,
  round,
  assessmentActions,
  onInspectVersion,
  detailed,
  showHistory,
  onDetails,
  onHistory,
  onInspectCriteria,
}: Pick<ReviewContentProps, "application" | "round" | "assessmentActions" | "onInspectVersion"> & {
  assessment: ReviewState["assessments"][number];
  detailed: boolean;
  showHistory: boolean;
  onDetails: () => void;
  onHistory: () => void;
  onInspectCriteria: (version: ReviewState["assessments"][number]["versions"][number]) => void;
}) => {
  const { t } = useTranslation("reviews");
  const criteria = round.criteria;
  const latest = assessment.versions.at(-1)!;
  return (
    <article aria-label={t("by", { name: assessment.reviewer })} className={styles.assessment}>
      <div className={styles.assessmentHeader}>
        <PersonIdentity name={assessment.reviewer} nameAs="h3" />
        {assessmentActions?.(assessment)}
      </div>
      <Stack gap={3} className={styles.assessmentContent}>
        {showHistory ? (
          <AssessmentHistory
            assessment={assessment}
            application={application}
            round={round}
            onInspectVersion={onInspectVersion}
            onInspectCriteria={onInspectCriteria}
          />
        ) : (
          <RecordedAssessment
            version={latest}
            applicationVersion={application.version}
            criteriaVersion={round.criteriaVersion}
            criteria={criteria}
            detailed={detailed}
            onInspectVersion={onInspectVersion}
            onInspectCriteria={() => onInspectCriteria(latest)}
            criteriaAction={`${assessment.id}:criteria`}
          />
        )}
        {!detailed && (
          <Button
            size="small"
            variant="quiet"
            alignment="start"
            data-review-action={`${assessment.id}:details`}
            onPress={onDetails}
          >
            {t("inspectBasis")}
            <Icon name="right" />
          </Button>
        )}
        {!showHistory && (assessment.previousId || assessment.versions.length > 1) && (
          <Button
            size="small"
            variant="quiet"
            alignment="start"
            data-review-action={`${assessment.id}:history`}
            onPress={onHistory}
          >
            {t("assessmentHistory")}
            <Icon name="right" />
          </Button>
        )}
      </Stack>
    </article>
  );
};

const AssessmentHistory = ({
  assessment,
  application,
  round,
  onInspectVersion,
  onInspectCriteria,
}: Pick<ReviewContentProps, "application" | "round" | "onInspectVersion"> & {
  assessment: ReviewState["assessments"][number];
  onInspectCriteria: (version: ReviewState["assessments"][number]["versions"][number]) => void;
}) => {
  const { t } = useTranslation("reviews");
  const state = application.reviews;
  const criteria = round.criteria;
  return (
    <>
      {state.assessments
        .filter((item) => item.contactId === assessment.contactId)
        .flatMap((item) =>
          (item.id === assessment.id ? item.versions.slice(0, -1) : item.versions).map(
            (version, index) => (
              <section key={`${item.id}/${index}`} className={styles.card}>
                <h3>{t("editCount", { version: index + 1 })}</h3>
                <RecordedAssessment
                  version={version}
                  detailed
                  applicationVersion={application.version}
                  criteriaVersion={round.criteriaVersion}
                  criteria={criteria}
                  onInspectVersion={onInspectVersion}
                  onInspectCriteria={() => onInspectCriteria(version)}
                  criteriaAction={`${item.id}:${index}:criteria`}
                />
              </section>
            ),
          ),
        )}
    </>
  );
};

const AssessmentDate = ({ date }: { date: string }) => {
  const { calendarDate } = useFormat();
  return calendarDate(date);
};

const ReviewRequestHistory = ({ requests }: { requests: ReviewState["requests"] }) => {
  const { t } = useTranslation("reviews");
  return (
    <section aria-label={t("requestHistory")}>
      <ul className={styles.requestHistoryList}>
        {requests.map((request) => (
          <li key={request.id}>
            <Inline justify="between">
              <PersonIdentity name={request.reviewer} />
              <span>
                {t(
                  request.status === "outstanding"
                    ? "outstanding"
                    : request.status === "received"
                      ? "received"
                      : request.closedBy?.cause === "application_withdrawn"
                        ? "closedWithdrawn"
                        : "cancelled",
                )}
              </span>
            </Inline>
            <RequestDetails request={request} />
          </li>
        ))}
      </ul>
    </section>
  );
};
