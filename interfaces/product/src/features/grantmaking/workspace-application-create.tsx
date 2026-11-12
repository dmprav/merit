import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateAction } from "@merit/grantmaking-web/creation";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";
import { Select } from "@merit/ui/select";

import type { ApplicationsSearch } from "./contracts/applications-location";
import { creationLocation } from "./contracts/creation-location";
import { workspaceCreationData } from "./data/creation/workspace-data";

export const WorkspaceApplicationCreate = ({
  workspaceSlug,
  rounds,
  search,
}: {
  workspaceSlug: string;
  rounds: readonly { id: string; title: string }[];
  search: ApplicationsSearch;
}) => {
  const { t } = useTranslation("fundingRounds");
  const client = useQueryClient();
  const navigate = useNavigate();
  const [roundId, setRoundId] = useState<string | null>(null);
  const round = rounds.find((item) => item.id === roundId);
  const returnSearch = { ...search, from: "applications" as const };
  if (!rounds.length) {
    return (
      <div>
        <p>{t("overview.createRoundFirst")}</p>
        <Link
          className={linkStyles.text}
          to="/app/$workspaceSlug/rounds"
          params={{ workspaceSlug }}
        >
          {t("overview.roundsLink")}
        </Link>
      </div>
    );
  }
  const data = round
    ? workspaceCreationData(
        client,
        {
          kind: "application",
          workspaceSlug,
          roundPublicId: round.id,
          roundTitle: round.title,
        },
        (location) => navigate({ ...location, search: returnSearch }),
      )
    : null;

  return (
    <Inline style={{ alignItems: "end" }}>
      <Select
        label={t("overview.createIn")}
        placeholder={t("overview.chooseRound")}
        selectedKey={round?.id ?? null}
        onSelectionChange={setRoundId}
        items={rounds.map((item) => ({ id: item.id, label: item.title }))}
      />
      {data ? (
        <CreateAction
          data={data}
          renderCreatedLink={(record, label) => (
            <Link
              className={linkStyles.text}
              {...creationLocation(data.target, record)}
              search={returnSearch}
            >
              {label}
            </Link>
          )}
        />
      ) : (
        <Button variant="secondary" size="small" isDisabled>
          {t("intake.add")}
        </Button>
      )}
    </Inline>
  );
};
