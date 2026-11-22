import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Panel } from "@merit/ui/panel";
import { Text } from "@merit/ui/text";

import type { AskApplicantInput } from "../contracts";

export type ProposalDecision = "awaiting" | "approved" | "declined";

/**
 * A change Merit AI proposes, for the person to decide: what it does, who it concerns, and what
 * happens if it goes ahead. It follows the confirmation pattern's decision contract: the choices
 * are disabled while the decision is recorded, and a failure shows beside them. Once decided it
 * folds to one line.
 */
export const Proposal = ({
  proposal,
  decision,
  isResolving,
  hasFailed,
  onApprove,
  onDecline,
  onRetry,
}: {
  proposal: AskApplicantInput;
  decision: ProposalDecision;
  isResolving: boolean;
  hasFailed: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onRetry: () => void;
}) => {
  const { t } = useTranslation("meritAi");
  const titleId = useId();

  if (decision !== "awaiting") {
    return (
      <Stack gap={2}>
        <Inline gap={2} align="baseline">
          <Text as="strong" variant="emphasis">
            {proposal.title}
          </Text>
          <Text variant="supporting">
            {decision === "approved" ? t("proposal.approved") : t("proposal.declined")}
          </Text>
        </Inline>
        {decision === "approved" && <Notice tone="neutral">{t("proposal.demoNotice")}</Notice>}
      </Stack>
    );
  }

  return (
    <Panel as="section" aria-labelledby={titleId}>
      <Stack gap={3}>
        <Inline gap={2} justify="between" align="start">
          <Text as="strong" variant="emphasis" id={titleId}>
            {proposal.title}
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
          {proposal.consequence}
        </Text>
        {hasFailed && (
          <Notice
            appearance="inline"
            tone="danger"
            role="alert"
            actions={
              <Button variant="quiet" onPress={onRetry}>
                {t("retry")}
              </Button>
            }
          >
            {t("proposal.error")}
          </Notice>
        )}
        <Inline gap={2}>
          <Button
            variant="primary"
            isPending={isResolving}
            isDisabled={isResolving || hasFailed}
            onPress={onApprove}
          >
            {isResolving ? t("proposal.approving") : t("proposal.approve")}
          </Button>
          <Button variant="quiet" isDisabled={isResolving || hasFailed} onPress={onDecline}>
            {t("proposal.decline")}
          </Button>
        </Inline>
      </Stack>
    </Panel>
  );
};
