import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { ReviewerPage } from "@merit/reviews/api";
import { isInvitationExpired } from "@merit/reviews/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { ModalDialog, DialogContent } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
  useReferenceViewport,
} from "@merit/ui/reference-workspace";
import { TextField } from "@merit/ui/text-field";

import type { ReviewerData } from "../../contracts/reviewer";
import { useReviewer, type ReviewerSession } from "../../controllers/reviewer/use-reviewer";
import { ReviewerAssessment, RetainedDraft } from "./reviewer-assessment";
import { ReviewerFeedback, type ReviewerErrorKey, type ReviewerWork } from "./reviewer-feedback";
import styles from "./reviewer.module.css";

type ReviewerReferenceKey = "material" | "criteria";

export const ReviewerScreen = ({
  initial,
  data,
  onDirtyChange,
  session,
  reference = "material",
}: {
  initial: ReviewerPage;
  data: ReviewerData;
  onDirtyChange?: (dirty: boolean) => void;
  session?: ReviewerSession;
  reference?: ReviewerReferenceKey;
}) => {
  const { t } = useTranslation("reviewer");
  const work = useReviewer(initial, data, onDirtyChange, session);
  const { page } = work;
  const assignment = page.assignment;
  const [conflictOpen, setConflictOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const expired = isInvitationExpired(assignment);
  const material = work.canWrite ? page.material : null;
  const errorKey = work.error as ReviewerErrorKey | null;

  return (
    <div className={styles.screen}>
      <ReferenceWorkspace
        header={
          <ReviewerHeader
            work={work}
            expired={expired}
            onWithdraw={() => setWithdrawOpen(true)}
            onConflict={() => setConflictOpen(true)}
          />
        }
        toWorkLabel={material ? t("toAssessment") : undefined}
        toReferenceLabel={material ? t("toMaterial") : undefined}
      >
        {material ? (
          <>
            <ReviewerReference page={page} material={material} reference={reference} />
            <ReviewerAssessment work={work} />
          </>
        ) : (
          <WorkPane
            as="section"
            label={t(assignment.status === "invited" ? "invitation" : "assignment")}
          >
            <ReviewerParticipation
              work={work}
              expired={expired}
              onDecline={() => setWithdrawOpen(true)}
              onConflict={() => setConflictOpen(true)}
            />
          </WorkPane>
        )}
      </ReferenceWorkspace>
      <ConflictDialog work={work} isOpen={conflictOpen} onOpenChange={setConflictOpen} />
      <ConfirmationDialog
        title={t("withdrawTitle")}
        description={t("withdrawHelp")}
        closeLabel={t("close")}
        cancelLabel={t("cancel")}
        confirmLabel={t("withdraw")}
        isOpen={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        isPending={work.busy}
        error={errorKey ? t(errorKey) : null}
        onConfirm={async () => {
          if (await work.respond("decline", "")) {
            setWithdrawOpen(false);
          }
        }}
      />
    </div>
  );
};

const ParticipationNotices = ({
  assignment,
  expired,
}: {
  assignment: ReviewerPage["assignment"];
  expired: boolean;
}) => {
  const { t } = useTranslation("reviewer");
  return (
    <>
      {assignment.status === "conflict" && (
        <Notice tone="warning">
          {t("paused")} {assignment.conflict}
        </Notice>
      )}
      {(assignment.status === "cancelled" || assignment.status === "declined") && (
        <Notice>{t("ended")}</Notice>
      )}
      {expired && <Notice tone="warning">{t("expired")}</Notice>}
    </>
  );
};

const ReviewerReference = ({
  page,
  material,
  reference: initialReference,
}: {
  page: ReviewerPage;
  material: NonNullable<ReviewerPage["material"]>;
  reference: ReviewerReferenceKey;
}) => {
  const { t } = useTranslation("reviewer");
  const { reference, referenceViewport, moveReference } =
    useReferenceViewport<ReviewerReferenceKey>(initialReference);
  const assignment = page.assignment;
  const labels: Record<ReviewerReferenceKey, string> = {
    material: t("evidence"),
    criteria: t("criteria"),
  };
  return (
    <ReferencePane
      label={t("reference")}
      viewportRef={referenceViewport}
      toolbar={
        <ReferenceSwitcher
          label={t("reference")}
          triggerLabel={t("referenceLabel", { name: labels[reference] })}
          options={labels}
          selected={reference}
          onChange={(next) => moveReference(next)}
        />
      }
    >
      <Stack as="section" gap={4} aria-label={labels.material} hidden={reference !== "material"}>
        <ReferenceHeading
          title={labels.material}
          version={t("applicationVersion", { version: assignment.applicationVersion })}
        />
        {assignment.materialChanged && <Notice tone="warning">{t("changed")}</Notice>}
        {material.submission?.answers.map((answer, index) => (
          <section key={index}>
            <h3>{answer.question}</h3>
            <p className={styles.writing}>{answer.response}</p>
          </section>
        ))}
        {material.evidence.map((evidence, index) => (
          <blockquote className={styles.writing} key={index}>
            {evidence.passage}
          </blockquote>
        ))}
      </Stack>
      <Stack as="section" gap={4} aria-label={labels.criteria} hidden={reference !== "criteria"}>
        <ReferenceHeading
          title={labels.criteria}
          version={t("criteriaVersion", { version: assignment.criteriaVersion })}
        />
        {assignment.criteriaChanged && <Notice tone="warning">{t("changed")}</Notice>}
        {page.criteria?.map((criterion, index) => (
          <section key={index}>
            <h3>{criterion.title}</h3>
            <p>{criterion.description}</p>
          </section>
        ))}
      </Stack>
    </ReferencePane>
  );
};

const ReferenceHeading = ({ title, version }: { title: string; version: string }) => (
  <div className={styles.referenceHeading}>
    <h2>{title}</h2>
    <span>{version}</span>
  </div>
);

const ReviewerHeader = ({
  work,
  expired,
  onWithdraw,
  onConflict,
}: {
  work: ReviewerWork;
  expired: boolean;
  onWithdraw: () => void;
  onConflict: () => void;
}) => {
  const { t } = useTranslation("reviewer");
  const format = useFormat();
  const { page } = work;
  const assignment = page.assignment;
  const editing = work.canWrite && page.material && (!page.assessment || work.amending);
  // An invitation offers conflict reporting beside its response instead.
  const active = !expired && ["accepted", "submitted"].includes(assignment.status);
  const actions = [
    ...(active ? [{ id: "conflict", label: t("conflict") }] : []),
    ...(assignment.status === "accepted" ? [{ id: "withdraw", label: t("withdraw") }] : []),
  ];
  return (
    <PageHeader
      density="compact"
      kicker={assignment.organization}
      title={assignment.applicationTitle}
      status={<Badge>{t(`status.${assignment.status}`)}</Badge>}
      description={
        <div className={styles.headerMeta}>
          <span>{assignment.applicant}</span>
          {page.material?.requested && (
            <strong>
              {t("requested", { amount: format.money(decodeMoney(page.material.requested)) })}
            </strong>
          )}
          <span>
            {assignment.dueDate
              ? t("dueOn", { date: format.calendarDate(assignment.dueDate) })
              : t("noDue")}
          </span>
          <span>
            {t("requestedBy", { name: assignment.managerName })} ·{" "}
            <a href={`mailto:${assignment.managerEmail}`}>{t("contact")}</a>
          </span>
        </div>
      }
      actions={
        <>
          <span role="status" className={styles.working}>
            {!editing && work.busy ? t("working") : ""}
          </span>
          {actions.length > 0 && (
            <ActionMenu
              label={t("moreActions")}
              trigger={
                <Button
                  size="small"
                  variant="quiet"
                  iconOnly
                  isDisabled={work.busy}
                  aria-label={t("moreActions")}
                >
                  <Icon name="more" />
                </Button>
              }
              items={actions}
              onAction={(action) => (action === "withdraw" ? onWithdraw() : onConflict())}
            />
          )}
        </>
      }
    />
  );
};

const ReviewerParticipation = ({
  work,
  expired,
  onDecline,
  onConflict,
}: {
  work: ReviewerWork;
  expired: boolean;
  onDecline: () => void;
  onConflict: () => void;
}) => {
  const { t } = useTranslation("reviewer");
  const assignment = work.page.assignment;
  return (
    <Reading>
      <Stack gap={5}>
        <ReviewerFeedback work={work} />
        <ParticipationNotices assignment={assignment} expired={expired} />
        <RetainedDraft work={work} />
        {work.page.membershipRequired && <Notice>{t("membershipRequired")}</Notice>}
        {assignment.status === "invited" && !expired && (
          <>
            <Stack gap={3}>
              <h2>{t("invitation")}</h2>
              <p>{t("invitedBy", { name: assignment.managerName })}</p>
              <p className={styles.invitationHelp}>{t("instructions")}</p>
            </Stack>
            <Inline className={styles.participationActions}>
              <Button
                isDisabled={work.busy || work.page.membershipRequired}
                onPress={() => void work.respond("accept", "")}
              >
                {t("accept")}
              </Button>
              {!assignment.hasSubmitted && (
                <Button variant="secondary" isDisabled={work.busy} onPress={onDecline}>
                  {t("decline")}
                </Button>
              )}
              <Button variant="quiet" isDisabled={work.busy} onPress={onConflict}>
                {t("conflict")}
              </Button>
            </Inline>
          </>
        )}
      </Stack>
    </Reading>
  );
};

const ConflictDialog = ({
  work,
  isOpen,
  onOpenChange,
}: {
  work: ReviewerWork;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation("reviewer");
  const [conflictNote, setConflictNote] = useState("");
  const errorKey = work.error as "unavailable" | "saveConflict" | "stale" | "expired" | null;
  return (
    <ModalDialog
      title={t("conflict")}
      closeLabel={t("close")}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissDisabled={work.busy}
    >
      <DialogContent label={t("conflict")}>
        <Stack gap={4}>
          {errorKey && (
            <Notice role="alert" tone="danger">
              {t(errorKey)}
            </Notice>
          )}
          <TextField
            label={t("conflictNote")}
            isRequired
            multiline
            maxLength={2000}
            value={conflictNote}
            onChange={setConflictNote}
          />
          <Button
            isDisabled={work.busy || !conflictNote.trim()}
            onPress={async () => {
              if (await work.respond("report_conflict", conflictNote)) {
                onOpenChange(false);
              }
            }}
          >
            {t("report")}
          </Button>
        </Stack>
      </DialogContent>
    </ModalDialog>
  );
};
