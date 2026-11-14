import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoundView } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { StateMessage } from "@merit/ui/state-message";

import type { PreparationData } from "../../contracts/preparation";
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
  round: RoundView;
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
  const preparation = usePreparationEditing({ round: props.round, ...props.session });
  if (preparation.deleted) {
    return (
      <div className={styles.deleted}>
        <StateMessage
          title={<span role="status">{t("preparation.deleted")}</span>}
          description={
            preparation.navigationFailed ? (
              <span role="alert">{t("preparation.navigationFailed")}</span>
            ) : undefined
          }
          actions={
            <Button autoFocus isPending={preparation.pending} onPress={preparation.returnToRounds}>
              {t("preparation.returnToRounds")}
            </Button>
          }
        />
      </div>
    );
  }
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
        hasApplications={Boolean(preparation.round.applications.length)}
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
  round: RoundView;
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
          <p>{round.purpose || t("preparation.purposeUnset")}</p>
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
                <h3>{criterion.title}</h3>
                {criterion.description && <p>{criterion.description}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t("round.noCriteria")}</p>
        )}
      </section>
    </div>
  );
};

const RoundProperties = ({
  round,
  preparation,
}: {
  round: RoundView;
  preparation?: PreparationEditing;
}) => {
  const { t } = useTranslation("roundPreparation");
  const { money, calendarDate } = useFormat();

  return (
    <DescriptionList className={styles.properties}>
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
          calendarDate(round.meetingDate)
        )}
      </DescriptionListItem>
      <DescriptionListItem label={t("preparation.responsibleManager")}>
        {preparation ? (
          <RoundManager preparation={preparation} />
        ) : (
          <PersonIdentity name={round.manager} />
        )}
        {round.managerNeedsReassignment && (
          <p className={styles.warning}>{t("preparation.reassignmentNeeded")}</p>
        )}
      </DescriptionListItem>
    </DescriptionList>
  );
};
