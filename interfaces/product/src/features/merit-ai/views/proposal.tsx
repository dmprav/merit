import { useEffect, useId, useLayoutEffect, useRef, type Ref } from "react";
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

/** Once decided, the card folds to its title and the outcome as a quiet status line. */
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
      <Stack gap={1}>
        <Text as="strong" variant="emphasis">
          {t("proposal.title", proposal.recipient)}
        </Text>
        <Notice appearance="inline" tone={decision === "approved" ? "success" : "neutral"}>
          {decision === "approved" ? t("proposal.approved") : t("proposal.declined")}
        </Notice>
        {decision === "approved" && (
          <Text as="p" variant="supporting">
            {t("proposal.demoNotice")}
          </Text>
        )}
      </Stack>
    </div>
  );
};

const Choices = ({
  recording,
  onApprove,
  onDecline,
  onFold,
}: {
  recording: Recording;
  onApprove: () => void;
  onDecline: () => void;
  /** The choices are folding away, and whether one of them held the focus as they went. */
  onFold: (hadFocus: boolean) => void;
}) => {
  const { t } = useTranslation("meritAi");
  const approve = useRef<HTMLButtonElement>(null);
  const decline = useRef<HTMLButtonElement>(null);
  const fold = useRef(onFold);
  useLayoutEffect(() => {
    fold.current = onFold;
  });
  // The layout cleanup runs before the buttons leave the page, while the focus is still known.
  useLayoutEffect(
    () => () => {
      const focused = document.activeElement;
      fold.current(
        focused !== null && (focused === approve.current || focused === decline.current),
      );
    },
    [],
  );
  const pendingLabel =
    recording === null
      ? null
      : t(recording === "approved" ? "proposal.approving" : "proposal.declining");

  return (
    <>
      {/* Declining comes first and approving, which commits, closes the row, as in a confirmation. */}
      <Inline gap={2} justify="end">
        <Button
          ref={decline}
          variant="secondary"
          aria-busy={recording === "declined"}
          aria-disabled={recording !== null}
          onPress={onDecline}
        >
          {recording === "declined" ? pendingLabel : t("proposal.decline")}
        </Button>
        <Button
          ref={approve}
          variant="primary"
          aria-busy={recording === "approved"}
          aria-disabled={recording !== null}
          onPress={onApprove}
        >
          {recording === "approved" ? pendingLabel : t("proposal.approve")}
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
  const choiceHadFocus = useRef(false);

  // The choice that was focused is gone once the proposal folds; its outcome takes the focus, but
  // not from where the person moved it while the decision was being recorded.
  useEffect(() => {
    if (decision !== "awaiting" && choiceHadFocus.current) {
      choiceHadFocus.current = false;
      decided.current?.focus();
    }
  }, [decision]);

  const choose = (choice: () => void) => () => {
    if (recording === null) {
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
          onFold={(hadFocus) => {
            choiceHadFocus.current = hadFocus;
          }}
        />
      </Stack>
    </Panel>
  );
};
