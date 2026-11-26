import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { SubmissionAnswers } from "@merit/applications-web/intake";
import { Form, FormActions, FormDialog, FormTextField, useForm } from "@merit/forms";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { ReviewerPage } from "@merit/reviews/api";
import { isInvitationExpired } from "@merit/reviews/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Divider } from "@merit/ui/divider";
import { Icon } from "@merit/ui/icon";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Link } from "@merit/ui/link";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { Panel } from "@merit/ui/panel";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  useReferenceViewport,
} from "@merit/ui/reference-workspace";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";

import type { ReviewerData } from "../../contracts/reviewer";
import { useReviewer, type ReviewerSession } from "../../controllers/reviewer/use-reviewer";
import { ReviewerAssessment, RetainedDraft } from "./reviewer-assessment";
import { ReviewerFeedback, type ReviewerWork } from "./reviewer-feedback";
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
  // Reviews returns material only to a reviewer who may read it, including after withdrawal.
  const material = page.material;
  const errorKey = work.error;

  return (
    <>
      {material ? (
        <ReferenceWorkspace
          header={
            <ReviewerHeader
              work={work}
              expired={expired}
              onWithdraw={() => setWithdrawOpen(true)}
              onConflict={() => setConflictOpen(true)}
            />
          }
          toWorkLabel={t("toAssessment")}
          toReferenceLabel={t("toMaterial")}
        >
          <ReviewerReference page={page} material={material} reference={reference} />
          <ReviewerAssessment work={work} />
        </ReferenceWorkspace>
      ) : (
        <div
          className={styles.invitationView}
          tabIndex={0}
          role="group"
          aria-label={t("assignment")}
        >
          <ReviewerParticipation
            work={work}
            expired={expired}
            onDecline={() => setWithdrawOpen(true)}
            onConflict={() => setConflictOpen(true)}
          />
        </div>
      )}
      <ConflictDialog work={work} isOpen={conflictOpen} onOpenChange={setConflictOpen} />
      <ConfirmationDialog
        title={t("withdrawTitle")}
        description={t("withdrawHelp")}
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
        {material.submission && <SubmissionAnswers answers={material.submission.answers} />}
        {material.evidence.map((evidence, index) => (
          <blockquote key={index}>
            <Reading>{evidence.passage}</Reading>
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
          <Stack as="section" gap={1} key={index}>
            <h3>
              <Text variant="emphasis">{criterion.title}</Text>
            </h3>
            <p>{criterion.description}</p>
          </Stack>
        ))}
      </Stack>
    </ReferencePane>
  );
};

const ReferenceHeading = ({ title, version }: { title: string; version: string }) => (
  <SectionHeader title={title} aside={<Text variant="supporting">{version}</Text>} />
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
  // An invitation offers conflict reporting beside its response instead. A withdrawn
  // application refuses both responses, so neither is offered while work is unavailable.
  const active = work.canWrite && !expired && ["accepted", "submitted"].includes(assignment.status);
  const actions = [
    ...(active ? [{ id: "conflict", label: t("conflict") }] : []),
    ...(active && assignment.status === "accepted"
      ? [{ id: "withdraw", label: t("withdraw") }]
      : []),
  ];
  return (
    <PageHeader
      density="compact"
      kicker={assignment.organization}
      title={assignment.applicationTitle}
      status={<Badge>{t(`status.${assignment.status}`)}</Badge>}
      description={
        <Stack gap={2}>
          <div className={styles.headerMeta}>
            <span>{assignment.applicant}</span>
            {page.material?.requested && (
              <span>
                {t("requested", { amount: format.money(decodeMoney(page.material.requested)) })}
              </span>
            )}
          </div>
        </Stack>
      }
      actions={
        <>
          <span role="status" className={styles.working}>
            {!editing && work.busy ? <Text variant="supporting">{t("working")}</Text> : null}
          </span>
          {actions.length > 0 && (
            <ActionMenu
              label={t("moreActions")}
              trigger={
                <Button
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
  const format = useFormat();
  const invited = assignment.status === "invited" && !expired;
  const title = expired
    ? t("invitationState.expired")
    : assignment.status === "invited"
      ? t("invitation")
      : t(`status.${assignment.status}`);
  return (
    <Panel as="section" padding={6} aria-label={title}>
      <PageHeader density="compact" kicker={assignment.organization} title={title} />
      <Stack gap={5}>
        <Stack gap={3}>
          <div>
            <Text as="p" variant="emphasis">
              {assignment.applicationTitle}
            </Text>
            <Text as="p" variant="supporting">
              {assignment.applicant}
            </Text>
          </div>
          <Text as="p" variant="supporting">
            {invited ? (
              t("invitedBy", { name: assignment.managerName })
            ) : (
              <Link href={`mailto:${assignment.managerEmail}`}>
                {t("contactManager", { name: assignment.managerName })}
              </Link>
            )}
          </Text>
          {invited && (
            <>
              <p className={styles.responseDate}>
                {assignment.dueDate
                  ? t("dueOn", { date: format.calendarDate(assignment.dueDate) })
                  : t("noDue")}
              </p>
              <p>{t("invitationTask")}</p>
            </>
          )}
          {expired && <p>{t("expired")}</p>}
          {(assignment.status === "cancelled" || assignment.status === "declined") && (
            <p>{t("ended")}</p>
          )}
          {assignment.status === "conflict" && (
            <>
              <p>{t("paused")}</p>
              {assignment.conflict && (
                <DescriptionList>
                  <DescriptionListItem label={t("reportedConflict")}>
                    <Reading as="p">{assignment.conflict}</Reading>
                  </DescriptionListItem>
                </DescriptionList>
              )}
            </>
          )}
        </Stack>
        {work.busy && (
          <div role="status">
            <Text as="p" variant="supporting">
              {t("working")}
            </Text>
          </div>
        )}
        <ReviewerFeedback work={work} />
        <RetainedDraft work={work} />
        {invited && (
          <ParticipationActions
            work={work}
            canDecline={!assignment.hasSubmitted}
            onDecline={onDecline}
            onConflict={onConflict}
          />
        )}
      </Stack>
    </Panel>
  );
};

const ParticipationActions = ({
  work,
  canDecline,
  onDecline,
  onConflict,
}: {
  work: ReviewerWork;
  canDecline: boolean;
  onDecline: () => void;
  onConflict: () => void;
}) => {
  const { t } = useTranslation("reviewer");
  return (
    <Stack gap={4}>
      <Divider />
      <Inline>
        <Button isDisabled={work.busy} onPress={() => void work.respond("accept", "")}>
          {t("accept")}
        </Button>
        {canDecline && (
          <Button variant="secondary" isDisabled={work.busy} onPress={onDecline}>
            {t("decline")}
          </Button>
        )}
        <Button variant="quiet" isDisabled={work.busy} onPress={onConflict}>
          {t("conflict")}
        </Button>
      </Inline>
    </Stack>
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
  const errorKey = work.error;
  const { form, submission } = useForm({
    defaultValues: { note: "" },
    schema: z.object({ note: z.string().trim().min(1, t("conflictRequired")).max(2000) }),
    onSubmit: async ({ note }) => {
      if (await work.respond("report_conflict", note)) {
        form.reset();
        onOpenChange(false);
      }
      return null;
    },
    submitErrorMessage: t("unavailable"),
  });
  const status = {
    ...submission,
    isSubmitting: submission.isSubmitting || work.busy,
    error: errorKey ? t(errorKey) : submission.error,
  };
  return (
    <FormDialog
      title={t("conflict")}
      context={work.page.assignment.applicationTitle}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissDisabled={status.isSubmitting}
    >
      <Form
        label={t("conflict")}
        submission={status}
        actions={
          <FormActions
            submission={status}
            onCancel={() => onOpenChange(false)}
            cancelLabel={t("close")}
            submitLabel={t("report")}
            submittingLabel={t("working")}
          />
        }
      >
        <p>{t("conflictEffect")}</p>
        <form.Field name="note">
          {(field) => (
            <FormTextField
              field={field}
              label={t("conflictNote")}
              isRequired
              multiline
              rows={3}
              maxLength={2000}
            />
          )}
        </form.Field>
      </Form>
    </FormDialog>
  );
};
