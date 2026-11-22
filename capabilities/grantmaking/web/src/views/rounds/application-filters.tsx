import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  applicationFilters,
  workspaceApplicationsInput,
  type ApplicationFilter,
} from "@merit/grantmaking/api";
import { CollectionFilter, CollectionToolbar } from "@merit/ui/collection-toolbar";

type Criterion = keyof ApplicationFilter;

const isCriterion = (key: string): key is Criterion => Object.hasOwn(applicationFilters, key);

const criteria: Criterion[] = [];
for (const key in applicationFilters) {
  if (isCriterion(key)) {
    criteria.push(key);
  }
}

type Props = {
  query: string;
  filter: ApplicationFilter;
  onChange: (value: { query: string; filter: ApplicationFilter }) => void;
  summary: ReactNode;
  round?: {
    choices: readonly { id: string; title: string }[];
    value: string;
    onChange: (id: string) => void;
  };
};

/** Round and workspace lists share the same independent application criteria. */
export const ApplicationFilters = ({ query, filter, onChange, summary, round }: Props) => {
  const { t } = useTranslation("fundingRounds");
  const selected = criteria.filter((key) => filter[key]);

  const remove = (key: Criterion) => {
    const next = { ...filter };
    delete next[key];
    onChange({ query, filter: next });
  };

  const roundLabel =
    round?.choices.find((item) => item.id === round.value)?.title ?? t("overview.unavailableRound");

  return (
    <CollectionToolbar
      filterLabel={t("applications.filter")}
      filterTitle={t("applications.filterTitle")}
      summary={summary}
      search={{
        label: t("applications.search"),
        clearLabel: t("applications.clearSearch"),
        placeholder: t("applications.searchPlaceholder"),
        value: query,
        maxLength: workspaceApplicationsInput.shape.query.unwrap().maxLength ?? undefined,
        onChange: (query) => onChange({ query, filter }),
      }}
      chips={[
        ...(round?.value
          ? [
              {
                id: "round",
                label: roundLabel,
                removeLabel: t("applications.removeFilter", { name: roundLabel }),
                onRemove: () => round.onChange(""),
              },
            ]
          : []),
        ...selected.flatMap((key) => {
          const choice = filter[key];
          if (!choice) {
            return [];
          }
          const label = t(`applications.filters.${choice}`);
          return [
            {
              id: key,
              label,
              removeLabel: t("applications.removeFilter", { name: label }),
              onRemove: () => remove(key),
            },
          ];
        }),
      ]}
      reset={{
        label: t("applications.clearFilters"),
        isDisabled: !query.trim() && !round?.value && selected.length === 0,
        onReset: () => {
          onChange({ query: "", filter: {} });
          round?.onChange("");
        },
      }}
      filters={
        <ApplicationCriteria
          filter={filter}
          round={round}
          onChange={(filter) => onChange({ query, filter })}
        />
      }
    />
  );
};

const ApplicationCriteria = ({
  filter,
  round,
  onChange,
}: Pick<Props, "filter" | "round"> & { onChange: (filter: ApplicationFilter) => void }) => {
  const { t } = useTranslation("fundingRounds");
  const unavailableRound = round?.value && !round.choices.some((item) => item.id === round.value);
  return (
    <>
      {round && (
        <CollectionFilter
          label={t("rounds.round")}
          selectedKey={round.value || "all"}
          onSelectionChange={(id) => round.onChange(id === "all" ? "" : id)}
          items={[
            { id: "all", label: t("overview.allRounds") },
            ...(unavailableRound
              ? [{ id: round.value, label: t("overview.unavailableRound") }]
              : []),
            ...round.choices.map((item) => ({ id: item.id, label: item.title })),
          ]}
        />
      )}
      {criteria.map((key) => (
        <CollectionFilter
          key={key}
          label={t(`applications.criteria.${key}`)}
          selectedKey={filter[key] ?? "any"}
          onSelectionChange={(value) => {
            if (value === "any") {
              const next = { ...filter };
              delete next[key];
              onChange(next);
            } else {
              onChange({ ...filter, [key]: value });
            }
          }}
          items={[
            { id: "any", label: t("applications.any") },
            ...applicationFilters[key].map((id) => ({
              id,
              label: t(`applications.filters.${id}`),
            })),
          ]}
        />
      ))}
    </>
  );
};
