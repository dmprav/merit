import type { ReactNode, Ref, ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { ReviewBasis } from "@merit/reviews/domain";
import {
  compareCriteriaContent,
  compareReviewBasis,
  reviewFreshness,
  type ReviewState,
} from "@merit/reviews/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Icon } from "@merit/ui/icon";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";

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
  const { content } = version;
  const amount = content.amount === null ? null : decodeMoney(content.amount);

  return (
    <>
      <AssessmentOutcome position={content.position} amount={amount} />
      <AssessmentBasisNotice
        version={version}
        applicationVersion={applicationVersion}
        criteriaVersion={criteriaVersion}
        criteria={criteria}
        onInspectVersion={onInspectVersion}
      />
      {/* A summary reads at body size beside other work; details are for sustained reading. */}
      <Reading as="p" prose={detailed}>
        {content.reasoning}
      </Reading>
      {detailed &&
        content.observations
          .filter((observation) => observation.text.trim())
          .map((observation, index) => (
            <Reading key={index}>
              <strong>{observation.criterion}</strong>
              <p>{observation.text}</p>
            </Reading>
          ))}
      {detailed && (
        <AssessmentDetails
          version={version}
          onInspectCriteria={onInspectCriteria}
          criteriaAction={criteriaAction}
        />
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
  const inspectedVersion = content.applicationVersion;
  return (
    <>
      {reviewFreshness(basis) !== "current" && (
        <Text as="div" variant="caption">
          <Inline>
            {basis.applicationVersion === "different" && (
              <>
                <span>{t("earlierSubmission")}</span>
                {onInspectVersion && inspectedVersion !== null && (
                  <Button variant="quiet" onPress={() => onInspectVersion(inspectedVersion)}>
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
        </Text>
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
      <DescriptionList layout="rows">
        <DescriptionListItem label={t("assessmentDate")}>
          {content.date ? calendarDate(content.date) : t("unknown")}
        </DescriptionListItem>
        <DescriptionListItem label={t("recordedByLabel")}>
          {version.recorder?.name ?? t("unknown")}
        </DescriptionListItem>
        {version.recorder && (
          <>
            <DescriptionListItem label={t("recordedAtLabel")}>
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
            </DescriptionListItem>
            <DescriptionListItem label={t("recordedThrough")}>
              <ActionProvenance value={version.recorder.provenance} detail />
            </DescriptionListItem>
          </>
        )}
        <DescriptionListItem label={t("submission")}>
          {content.applicationVersion === null
            ? t("unknown")
            : t("version", { version: content.applicationVersion })}
        </DescriptionListItem>
        <DescriptionListItem label={t("criteriaVersion")}>
          {content.criteriaVersion === null
            ? t("unknown")
            : t("version", { version: content.criteriaVersion })}
        </DescriptionListItem>
      </DescriptionList>
      {version.note && (
        <div>
          <strong>{t("note")}</strong>
          <Reading as="p">{version.note}</Reading>
        </div>
      )}
      <Button
        variant="quiet"
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
        <Text as="p" variant="supporting">
          {version.content.criteriaVersion === null
            ? t("criteriaBasisUnknown")
            : t("version", { version: version.content.criteriaVersion })}
        </Text>
        <CriteriaRecord criteria={version.criteria} />
      </section>
      {compareCriteriaContent(version.criteria, criteria) === "different" && (
        <section aria-label={t("latestCriteria")} className={styles.detailCriteria}>
          <div>
            <SectionHeader level={3} title={t("latestCriteria")} />
            <Text as="p" variant="supporting">
              {t("version", { version: criteriaVersion })}
            </Text>
          </div>
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
    <Text as="p" variant="missing">
      {t("unknown")}
    </Text>
  ) : (
    <dl>
      {criteria.map((item, index) => (
        <div key={index}>
          <dt>
            <Text variant="emphasis">{item.title}</Text>
          </dt>
          {item.description && (
            <Text as="dd" variant="supporting">
              {item.description}
            </Text>
          )}
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
      {latest.length > 0 && (
        <Stack gap={5} divided="between">
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
              onInspectCriteria={(version) =>
                inspect({ kind: "criteria", id: assessment.id, version })
              }
              onInspectVersion={onInspectVersion}
            />
          ))}
        </Stack>
      )}
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
          variant="quiet"
          alignment="start"
          data-review-action="requests"
          onPress={() => inspect({ kind: "requests" })}
        >
          {t("requestHistory")} <Text variant="supporting">{state.requests.length}</Text>
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
        <Button variant="quiet" alignment="start" onPress={back}>
          <Icon name="left" />
          {t(inspectionReturnLabel(previous))}
        </Button>
        <SectionHeader headingRef={heading} title={t(inspectionTitle(inspection))} />
      </>
    );
  }
  return (
    <div className={styles.reviewHeader}>
      <SectionHeader title={title ?? t("title")} count={count || undefined} aside={actions} />
    </div>
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
        <div className={styles.reviewHeader}>
          <SectionHeader title={t("awaitingTitle")} count={pending.length} />
        </div>
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
                <div className={styles.requestChange}>
                  <Text as="p" variant="caption">
                    {t("requestChanged")}
                  </Text>
                </div>
              ) : (
                freshness === "unknown" && (
                  <div className={styles.requestChange}>
                    <Text as="p" variant="caption">
                      {t("basisUnknown")}
                    </Text>
                  </div>
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
  const latest = assessment.versions.at(-1);
  if (!latest) {
    return null;
  }
  return (
    <article aria-label={t("by", { name: assessment.reviewer })}>
      <div>
        <div className={styles.assessmentHeader}>
          <span className={styles.assessmentAuthor}>
            <PersonIdentity name={assessment.reviewer} nameAs="h3" />
            {!detailed && !showHistory && (
              <Text variant="caption">
                {latest.content.date ? (
                  <AssessmentDate date={latest.content.date} />
                ) : (
                  t("dateUnknown")
                )}
              </Text>
            )}
          </span>
          {assessmentActions?.(assessment)}
        </div>
        <Stack gap={3}>
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
      </div>
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
    <div className={styles.history}>
      <Stack gap={4} divided="between">
        {state.assessments
          .filter((item) => item.contactId === assessment.contactId)
          .flatMap((item) =>
            (item.id === assessment.id ? item.versions.slice(0, -1) : item.versions).map(
              (version, index) => (
                <section key={`${item.id}/${index}`}>
                  <div className={styles.card}>
                    <SectionHeader level={3} title={t("editCount", { version: index + 1 })} />
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
                  </div>
                </section>
              ),
            ),
          )}
      </Stack>
    </div>
  );
};

const AssessmentDate = ({ date }: { date: string }) => {
  const { calendarDate } = useFormat();
  return calendarDate(date);
};

const ReviewRequestHistory = ({ requests }: { requests: ReviewState["requests"] }) => {
  const { t } = useTranslation("reviews");
  return (
    <section aria-label={t("requestHistory")} className={styles.requestHistory}>
      <Stack as="ul" gap={0} divided="between">
        {requests.map((request) => (
          <li key={request.id} className={styles.requestEntry}>
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
      </Stack>
    </section>
  );
};
