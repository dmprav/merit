import { type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { DecisionVersion } from "@merit/decisions/domain";
import { PanelSection } from "@merit/ui/panel-section";
import { useEventToast } from "@merit/ui/toast";

import type { DecisionData } from "../../contracts/decisions";
import { useDecision } from "../../controllers/decisions/use-decision";
import { DecisionEditor } from "./decision-editor";
import { DecisionSummary } from "./decision-summary";

type ApplicationDecisionProps = Pick<
  ComponentProps<typeof DecisionEditor>,
  "application" | "round" | "onClose" | "children"
> & {
  applicationKey: string;
  data: DecisionData;
};

export const ApplicationDecision = ({
  applicationKey,
  application,
  round,
  data,
  onClose,
  children,
}: ApplicationDecisionProps) => {
  const { t } = useTranslation("committeeDecisions");
  const {
    draft,
    conflict,
    draftReset,
    saved,
    unchanged,
    save,
    updateDraft,
    keepDraft,
    loadLatest,
    ready,
  } = useDecision(applicationKey, data);
  useEventToast(saved, { tone: "success", message: t("editor.saved") });
  useEventToast(unchanged, { tone: "neutral", message: t("editor.unchanged") });

  return (
    <DecisionEditor
      key={applicationKey}
      application={application}
      round={round}
      versions={data.versions}
      disabled={data.disabled}
      ready={ready}
      draft={draft}
      conflict={conflict}
      draftReset={draftReset}
      onDraftChange={updateDraft}
      onKeepDraft={keepDraft}
      onLoadLatest={loadLatest}
      onSave={save}
      onClose={onClose}
    >
      {children}
    </DecisionEditor>
  );
};

/** The committee decision section of the application overview, above the recommendation. */
export const ApplicationDecisionSummary = ({
  versions,
  action,
}: {
  versions: readonly DecisionVersion[];
  action?: ReactNode;
}) => {
  const { t } = useTranslation("committeeDecisions");
  return (
    <PanelSection title={t("section.title")} actions={action}>
      <DecisionSummary versions={versions} />
    </PanelSection>
  );
};
