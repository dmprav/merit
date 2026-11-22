import { useEffect, useId, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Panel } from "@merit/ui/panel";
import { StatusMessage } from "@merit/ui/status-message";
import { Text } from "@merit/ui/text";

import type { AskApplicantInput } from "../contracts";
import styles from "./merit-ai.module.css";

export type ProposalDecision = "awaiting" | "approved" | "declined";

type Recording = "approved" | "declined" | null;

const Decided = ({
  proposal,
  decision,
  ref,
}: {
  proposal: AskApplicantInput;
  decision: "approved" | "declined";
  ref: Ref<HTMLDivElement>;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <div ref={ref} tabIndex={-1} className={styles.decided}>
      <Stack gap={2}>
        <Inline gap={2} align="baseline">
          <Text as="strong" variant="emphasis">
            {t("proposal.title", proposal.recipient)}
          </Text>
          <Text variant="supporting">
            {decision === "approved" ? t("proposal.approved") : t("proposal.declined")}
          </Text>
        </Inline>
        {decision === "approved" && <Notice tone="neutral">{t("proposal.demoNotice")}</Notice>}
      </Stack>
    </div>
  );
};

const Choices = ({
  recording,
  onApprove,
  onDecline,
}: {
  recording: Recording;
  onApprove: () => void;
  onDecline: () => void;
}) => {
  const { t } = useTranslation("meritAi");
  const pendingLabel =
    recording === null
      ? null
      : t(recording === "approved" ? "proposal.approving" : "proposal.declining");

  return (
    <>
      <Inline gap={2}>
        <Button
          variant="primary"
          aria-busy={recording === "approved"}
          aria-disabled={recording !== null}
          onPress={onApprove}
        >
          {recording === "approved" ? pendingLabel : t("proposal.approve")}
        </Button>
        <Button
          variant="quiet"
          aria-busy={recording === "declined"}
          aria-disabled={recording !== null}
          onPress={onDecline}
        >
          {recording === "declined" ? pendingLabel : t("proposal.decline")}
        </Button>
      </Inline>
      {/* A local announcement goes with the buttons when they fold away, as in a confirmation. */}
      <StatusMessage message={pendingLabel} eventId={recording ?? "none"} />
    </>
  );
};

/**
 * A change Merit AI proposes, for the person to decide: what it does, who it concerns, and what
 * happens if it goes ahead. It follows the confirmation pattern's decision contract: while a
 * decision is recorded its button stays focusable and busy and the other waits, and a failure shows
 * beside both choices, which stay available to try again. Once decided it folds to one line and
 * takes the focus the choice held.
 */
export const Proposal = ({
  proposal,
  decision,
  recording,
  hasFailed,
  onApprove,
  onDecline,
}: {
  proposal: AskApplicantInput;
  decision: ProposalDecision;
  /** The choice being recorded, while it is. */
  recording: Recording;
  hasFailed: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) => {
  const { t } = useTranslation("meritAi");
  const titleId = useId();
  const decided = useRef<HTMLDivElement>(null);
  const hasChosen = useRef(false);

  // The choice that was focused is gone once the proposal folds; its outcome takes the focus.
  useEffect(() => {
    if (decision !== "awaiting" && hasChosen.current) {
      hasChosen.current = false;
      decided.current?.focus();
    }
  }, [decision]);

  const choose = (choice: () => void) => () => {
    if (recording === null) {
      hasChosen.current = true;
      choice();
    }
  };

  if (decision !== "awaiting") {
    return <Decided proposal={proposal} decision={decision} ref={decided} />;
  }

  return (
    <Panel as="section" aria-labelledby={titleId}>
      <Stack gap={3}>
        <Inline gap={2} justify="between" align="start">
          <Text as="strong" variant="emphasis" id={titleId}>
            {t("proposal.title", proposal.recipient)}
          </Text>
          <Badge tone="warning">{t("proposal.needsApproval")}</Badge>
        </Inline>
        <DescriptionList>
          <DescriptionListItem label={t("proposal.recipient")}>
            {t("proposal.recipientValue", proposal.recipient)}
          </DescriptionListItem>
          <DescriptionListItem label={t("proposal.message")}>
            <Reading as="p" prose={false}>
              {proposal.message}
            </Reading>
          </DescriptionListItem>
        </DescriptionList>
        <Text as="p" variant="supporting">
          {t("proposal.consequence", proposal.recipient)}
        </Text>
        {hasFailed && recording === null && (
          <Notice appearance="inline" tone="danger" role="alert">
            {t("proposal.error")}
          </Notice>
        )}
        <Choices
          recording={recording}
          onApprove={choose(onApprove)}
          onDecline={choose(onDecline)}
        />
      </Stack>
    </Panel>
  );
};
