import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { Badge } from "@merit/ui/badge";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Reading } from "@merit/ui/layout";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { StatusIndicator } from "@merit/ui/status-indicator";
import { Text } from "@merit/ui/text";
import { CalendarDate } from "@merit/ui/timestamp";
import { showToast } from "@merit/ui/toast";

import type { PreparationData, PreparationRound } from "../../contracts/preparation";
import styles from "./preparation-content.module.css";
import {
  RoundTitle,
  RoundEditButton,
  RoundEditor,
  RoundBudget as RoundBudgetEditor,
  RoundDate,
  RoundManager,
  RoundActions,
  RoundFeedback,
  RoundDeleteConfirmation,
} from "./round-preparation";
import { usePreparationEditing, type PreparationEditing } from "./use-preparation-editing";

export type PreparationSession = { data: PreparationData; onDeleted: () => Promise<void> };

type Content = {
  title: ReactNode;
  actions: ReactNode;
  feedback: ReactNode;
  overview: ReactNode;
  properties: ReactNode;
};

type Props = {
  round: PreparationRound;
  session?: PreparationSession;
  children: (content: Content) => ReactNode;
};

/** Owns round editing and its reading views without exposing editor state to screens. */
export const RoundPreparation = (props: Props) =>
  props.session ? (
    <EditablePreparation {...props} session={props.session} />
  ) : (
    <PreparationPresentation {...props} />
  );

const EditablePreparation = (props: Props & { session: PreparationSession }) => {
  const { t } = useTranslation("roundPreparation");
  const preparation = usePreparationEditing({
    round: props.round,
    data: props.session.data,
    onDeleted: () => {
      showToast({ tone: "success", message: t("preparation.deleted") });
      return props.session.onDeleted();
    },
  });
  return <PreparationPresentation {...props} preparation={preparation} />;
};

const PreparationPresentation = ({
  round,
  children,
  preparation,
}: Props & { preparation?: PreparationEditing }) =>
  children({
    title: preparation ? <RoundTitle preparation={preparation} /> : round.title,
    actions: preparation && (
      <RoundActions
        hasApplications={Boolean(preparation.round.applicationCount)}
        pending={preparation.pending || !preparation.ready}
        onDelete={() => preparation.setDeleting(true)}
        triggerRef={preparation.registerMenuTrigger}
      />
    ),
    feedback: preparation && (
      <>
        <RoundFeedback preparation={preparation} />
        <RoundDeleteConfirmation preparation={preparation} />
      </>
    ),
    overview: <RoundOverview round={round} preparation={preparation} />,
    properties: <RoundProperties round={round} preparation={preparation} />,
  });

const RoundOverview = ({
  round,
  preparation,
}: {
  round: PreparationRound;
  preparation?: PreparationEditing;
}) => {
  const { t } = useTranslation("roundPreparation");

  return (
    <div className={styles.overview}>
      <section className={styles.detailSection}>
        {preparation?.editing !== "purpose" && (
          <SectionHeader
            title={t("round.purpose")}
            aside={preparation && <RoundEditButton preparation={preparation} section="purpose" />}
          />
        )}
        {preparation?.editing === "purpose" ? (
          <RoundEditor preparation={preparation} section="purpose" />
        ) : (
          <Reading as="p">{round.purpose || t("preparation.purposeUnset")}</Reading>
        )}
      </section>
      <section className={styles.detailSection}>
        <SectionHeader
          title={t("round.criteria")}
          aside={
            preparation &&
            preparation.editing !== "criteria" && (
              <RoundEditButton preparation={preparation} section="criteria" />
            )
          }
        />
        {preparation?.editing === "criteria" ? (
          <RoundEditor preparation={preparation} section="criteria" />
        ) : round.criteria.length ? (
          <ul className={styles.criteria}>
            {round.criteria.map((criterion, index) => (
              <li key={index}>
                <SectionHeader level={3} title={criterion.title} />
                {criterion.description && <Reading as="p">{criterion.description}</Reading>}
              </li>
            ))}
          </ul>
        ) : (
          <Text as="p" variant="missing">
            {t("round.noCriteria")}
          </Text>
        )}
      </section>
    </div>
  );
};

const RoundProperties = ({
  round,
  preparation,
}: {
  round: PreparationRound;
  preparation?: PreparationEditing;
}) => {
  const { t } = useTranslation("roundPreparation");
  const { money } = useFormat();

  return (
    <div className={styles.properties}>
      <DescriptionList layout="rows">
        <DescriptionListItem label={t("round.status")}>
          <Badge>{round.decisionStatus}</Badge>
        </DescriptionListItem>
        <DescriptionListItem label={t("budget.total")}>
          {preparation ? (
            <RoundBudgetEditor preparation={preparation} />
          ) : round.budget === null ? (
            t("preparation.notSet")
          ) : (
            money(round.budget)
          )}
        </DescriptionListItem>
        <DescriptionListItem label={t("round.committeeDate")}>
          {preparation ? (
            <RoundDate preparation={preparation} />
          ) : round.meetingDate === null ? (
            t("preparation.notScheduled")
          ) : (
            <CalendarDate value={round.meetingDate} />
          )}
        </DescriptionListItem>
        <DescriptionListItem label={t("preparation.responsibleManager")}>
          <span className={styles.manager}>
            {preparation ? (
              <RoundManager preparation={preparation} />
            ) : round.manager.trim() ? (
              <PersonIdentity name={round.manager.trim()} />
            ) : (
              <PersonIdentity
                name={t(
                  round.managerNeedsReassignment
                    ? "preparation.unassigned"
                    : "preparation.unknownPerson",
                )}
                isPlaceholder
              />
            )}
            {round.manager.trim() && round.managerNeedsReassignment && (
              <StatusIndicator
                label={t("preparation.reassignmentStatus")}
                explanation={t("preparation.reassignmentNeeded")}
              />
            )}
          </span>
        </DescriptionListItem>
      </DescriptionList>
    </div>
  );
};
