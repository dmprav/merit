import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import { RecommendationOutcome } from "@merit/recommendations-web/work";
import type { ReviewBasis } from "@merit/reviews/domain";
import {
  compareCriteriaContent,
  compareReviewBasis,
  reviewFreshness,
  type ReviewState,
} from "@merit/reviews/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { DialogContent, ModalDialog, PopoverDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";

import type { ReviewApplication, ReviewRound } from "../../contracts/reviews";
import { RequestDetails } from "./request-details";
import styles from "./review-work.module.css";

const RecordedAssessment = ({
  version,
  applicationVersion,
  criteria,
  criteriaVersion,
  onInspectVersion,
}: {
  version: ReviewState["assessments"][number]["versions"][number];
  applicationVersion: NonNullable<ReviewBasis["applicationVersion"]>;
  criteriaVersion: NonNullable<ReviewBasis["criteriaVersion"]>;
  criteria: NonNullable<ReviewRound["criteria"]>;
  onInspectVersion?: (version: ReviewApplication["version"]) => void;
}) => {
  const { t } = useTranslation("reviews");
  const { content } = version;
  const basis = compareReviewBasis(
    { ...content, criteria: version.criteria },
    { applicationVersion, criteriaVersion, criteria },
  );
  const amount = content.amount === null ? null : parseMoney(content.amount);

  return (
    <>
      {reviewFreshness(basis) !== "current" && (
        <Inline>
          {basis.applicationVersion === "different" && (
            <>
              <Badge tone="warning">{t("applicationChanged")}</Badge>
              {onInspectVersion && (
                <Button
                  variant="quiet"
                  size="small"
                  onPress={() => onInspectVersion(content.applicationVersion!)}
                >
                  {t("viewVersionHistory")} <Icon name="right" />
                </Button>
              )}
            </>
          )}
          {basis.criteriaContent === "different" && (
            <Badge tone="warning">{t("criteriaChanged")}</Badge>
          )}
          {(basis.applicationVersion === "unknown" || basis.criteriaContent === "unknown") && (
            <Badge>
              {t(
                basis.applicationVersion === "unknown" && basis.criteriaContent === "unknown"
                  ? "basisUnknown"
                  : basis.applicationVersion === "unknown"
                    ? "applicationBasisUnknown"
                    : "criteriaBasisUnknown",
              )}
            </Badge>
          )}
        </Inline>
      )}
      <RecommendationOutcome
        recommendation={{
          position: content.position,
          allocation: amount?.ok ? amount.value : null,
        }}
      />
      <p className={styles.reasoning}>{content.reasoning}</p>
      {content.observations
        .filter((observation) => observation.text.trim())
        .map((observation, index) => (
          <div key={index} className={styles.reasoning}>
            <strong>{observation.criterion}</strong>
            <p>{observation.text}</p>
          </div>
        ))}
      <AssessmentDetails version={version} criteria={criteria} />
    </>
  );
};

const AssessmentDetails = ({
  version,
  criteria,
}: {
  version: ReviewState["assessments"][number]["versions"][number];
  criteria: NonNullable<ReviewRound["criteria"]>;
}) => {
  const { t } = useTranslation("reviews");
  const { formatLocale } = useLocaleSettings();
  const { calendarDate } = useFormat();
  const { content } = version;

  return (
    <PopoverDialog
      title={t("inspectBasis")}
      closeLabel={t("close")}
      placement="bottom start"
      trigger={
        <Button size="small" variant="quiet">
          {t("inspectBasis")}
        </Button>
      }
    >
      <div className={styles.reviewDetails}>
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
        </dl>
        {version.note && <p className={styles.reasoning}>{version.note}</p>}
        <section className={styles.detailCriteria}>
          <h3>{t("originalCriteria")}</h3>
          {version.criteria === null ? (
            <p className={styles.meta}>{t("unknown")}</p>
          ) : (
            <dl>
              {version.criteria.map((item, index) => (
                <div key={index}>
                  <dt>{item.title}</dt>
                  {item.description && <dd>{item.description}</dd>}
                </div>
              ))}
            </dl>
          )}
        </section>
        {compareCriteriaContent(version.criteria, criteria) === "different" && (
          <section className={styles.detailCriteria}>
            <h3>{t("latestCriteria")}</h3>
            <dl>
              {criteria.map((item, index) => (
                <div key={index}>
                  <dt>{item.title}</dt>
                  {item.description && <dd>{item.description}</dd>}
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </PopoverDialog>
  );
};

type ReviewContentProps = {
  application: ReviewApplication;
  round: ReviewRound;
  headerActions?: ReactNode;
  feedback?: ReactNode;
  assessmentActions?: (assessment: ReviewState["assessments"][number]) => ReactNode;
  requestActions?: (request: ReviewState["requests"][number]) => ReactNode;
  selectedId?: string;
  onInspectVersion?: (version: ReviewApplication["version"]) => void;
};

export const ReviewContent = ({
  application,
  round,
  headerActions,
  feedback,
  assessmentActions,
  requestActions,
  selectedId,
  onInspectVersion,
}: ReviewContentProps) => {
  const { t } = useTranslation("reviews");
  const state = application.reviews;
  const criteria = round.criteria;
  const superseded = new Set(
    state.assessments.flatMap((item) => (item.previousId ? [item.previousId] : [])),
  );
  const latest = state.assessments.filter(
    (item) => !superseded.has(item.id) && (!selectedId || item.id === selectedId),
  );
  const pending = state.requests.filter(
    (request) => request.status === "outstanding" && (!selectedId || request.id === selectedId),
  );

  return (
    <Stack as="section" gap={5} aria-label={t("title")} className={styles.reviews}>
      {!selectedId && (
        <SectionHeader
          title={t("title")}
          className={styles.reviewHeader}
          count={latest.length || undefined}
          aside={headerActions}
        />
      )}
      {feedback}
      {selectedId && !latest.length && !pending.length && <p>{t("selectedUnavailable")}</p>}
      {!selectedId && !state.assessments.length && !state.requests.length && (
        <p>{t("noReviews")}</p>
      )}
      {latest.map((assessment) => (
        <AssessmentEntry
          key={assessment.id}
          assessment={assessment}
          application={application}
          round={round}
          assessmentActions={assessmentActions}
          selectedId={selectedId}
          onInspectVersion={onInspectVersion}
        />
      ))}
      {pending.length > 0 && (
        <Stack as="section" gap={3} aria-label={t("awaitingTitle")}>
          {!selectedId && (
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
              criteria,
            });
            const freshness = reviewFreshness(basis);
            return (
              <article key={request.id} aria-label={request.reviewer} className={styles.pendingRow}>
                <div className={styles.requestPerson}>
                  <PersonIdentity name={request.reviewer} description={t("outstanding")} />
                  {selectedId && <RequestDetails request={request} />}
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
      )}
      {!selectedId && state.requests.length > 0 && (
        <ReviewRequestHistory requests={state.requests} />
      )}
    </Stack>
  );
};

const AssessmentEntry = ({
  assessment,
  application,
  round,
  assessmentActions,
  selectedId,
  onInspectVersion,
}: Pick<
  ReviewContentProps,
  "application" | "round" | "assessmentActions" | "selectedId" | "onInspectVersion"
> & { assessment: ReviewState["assessments"][number] }) => {
  const { t } = useTranslation("reviews");
  const { calendarDate } = useFormat();
  const state = application.reviews;
  const criteria = round.criteria;
  return (
    <article aria-label={t("by", { name: assessment.reviewer })} className={styles.assessment}>
      <div className={styles.assessmentHeader}>
        <PersonIdentity
          name={assessment.reviewer}
          nameAs="h3"
          description={
            assessment.authorUserId
              ? t("submittedBy", {
                  name: assessment.versions.at(-1)!.recorder?.name ?? assessment.reviewer,
                })
              : assessment.versions.at(-1)!.content.date
                ? calendarDate(assessment.versions.at(-1)!.content.date!)
                : assessment.versions.at(-1)!.recorder
                  ? t("recordedBy", { name: assessment.versions.at(-1)!.recorder!.name })
                  : undefined
          }
        />
        {assessmentActions?.(assessment)}
      </div>
      <Stack gap={3} className={styles.assessmentContent}>
        <RecordedAssessment
          version={assessment.versions.at(-1)!}
          applicationVersion={application.version}
          criteriaVersion={round.criteriaVersion}
          criteria={criteria}
          onInspectVersion={selectedId ? onInspectVersion : undefined}
        />
        {(assessment.previousId || assessment.versions.length > 1) && (
          <ModalDialog
            title={t("assessmentHistory")}
            closeLabel={t("close")}
            size="wide"
            trigger={
              <Button size="small" variant="quiet">
                {t("assessmentHistory")}
              </Button>
            }
          >
            <DialogContent label={t("assessmentHistory")}>
              {state.assessments
                .filter((item) => item.contactId === assessment.contactId)
                .flatMap((item) =>
                  (item.id === assessment.id ? item.versions.slice(0, -1) : item.versions).map(
                    (version, index) => (
                      <div key={`${item.id}/${index}`} className={styles.card}>
                        <strong>{t("editCount", { version: index + 1 })}</strong>
                        <RecordedAssessment
                          version={version}
                          applicationVersion={application.version}
                          criteriaVersion={round.criteriaVersion}
                          criteria={criteria}
                          onInspectVersion={selectedId ? onInspectVersion : undefined}
                        />
                      </div>
                    ),
                  ),
                )}
            </DialogContent>
          </ModalDialog>
        )}
      </Stack>
    </article>
  );
};

const ReviewRequestHistory = ({ requests }: { requests: ReviewState["requests"] }) => {
  const { t } = useTranslation("reviews");
  return (
    <PopoverDialog
      title={t("requestHistory")}
      closeLabel={t("close")}
      placement="top start"
      trigger={
        <Button size="small" variant="quiet">
          {t("requestHistory")} <span className={styles.meta}>{requests.length}</span>
        </Button>
      }
    >
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
                      : "cancelled",
                )}
              </span>
            </Inline>
            <RequestDetails request={request} />
          </li>
        ))}
      </ul>
    </PopoverDialog>
  );
};
