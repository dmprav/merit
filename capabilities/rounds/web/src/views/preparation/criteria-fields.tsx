import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FormTextField, type useForm } from "@merit/forms";
import { roundPreparationLimits } from "@merit/rounds/domain";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { Panel } from "@merit/ui/panel";
import { StatusMessage } from "@merit/ui/status-message";
import { Text } from "@merit/ui/text";
import { Tooltip } from "@merit/ui/tooltip";

import type { PreparationValues } from "../../controllers/preparation/preparation-state";
import styles from "./preparation.module.css";

type CriteriaFieldsProps = {
  form: ReturnType<typeof useForm<PreparationValues["criteria"]>>["form"];
  isSubmitting: boolean;
};

export const CriteriaFields = ({ form, isSubmitting }: CriteriaFieldsProps) => {
  const { t } = useTranslation("roundPreparation");
  const [focusRequest, setFocusRequest] = useState<{
    key: string | null;
    action: "title" | "up" | "down";
  } | null>(null);
  const { announcement, moved, removed } = useCriterionAnnouncements();

  const criterionId = useId();
  const criteriaElement = useCriterionFocus(focusRequest, criterionId);

  return (
    <form.Field name="criteria" mode="array">
      {(field) => (
        <div className={styles.fields} ref={criteriaElement}>
          <StatusMessage eventId={announcement.event} message={announcement.message} />
          {field.state.value.map((criterion, index) => (
            <Panel as="fieldset" key={criterion.key} id={`${criterionId}-${criterion.key}`}>
              <Text as="legend" variant="caption">
                {t("preparation.criterion", { number: index + 1 })}
              </Text>
              <Stack gap={3}>
                <CriterionInputs form={form} index={index} isReadOnly={isSubmitting} />
                <div className={styles.criterionActions}>
                  <Tooltip content={t("preparation.moveUp")}>
                    <Button
                      variant="quiet"
                      iconOnly
                      isDisabled={index === 0 || isSubmitting}
                      aria-label={t("preparation.moveUpFor", { number: index + 1 })}
                      data-criterion-action="up"
                      onPress={() => {
                        field.swapValues(index, index - 1);
                        setFocusRequest({ key: criterion.key, action: "up" });
                        moved(criterion.title, index);
                      }}
                    >
                      <Icon name="ascending" />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t("preparation.moveDown")}>
                    <Button
                      variant="quiet"
                      iconOnly
                      isDisabled={index === field.state.value.length - 1 || isSubmitting}
                      aria-label={t("preparation.moveDownFor", { number: index + 1 })}
                      data-criterion-action="down"
                      onPress={() => {
                        field.swapValues(index, index + 1);
                        setFocusRequest({ key: criterion.key, action: "down" });
                        moved(criterion.title, index + 2);
                      }}
                    >
                      <Icon name="descending" />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t("preparation.remove")}>
                    <Button
                      variant="quiet"
                      iconOnly
                      isDisabled={isSubmitting}
                      aria-label={t("preparation.removeFor", { number: index + 1 })}
                      onPress={() => {
                        const next = field.state.value[index + 1] ?? field.state.value[index - 1];
                        field.removeValue(index);
                        setFocusRequest({ key: next?.key ?? null, action: "title" });
                        removed(criterion.title);
                      }}
                    >
                      <Icon name="discard" />
                    </Button>
                  </Tooltip>
                </div>
              </Stack>
            </Panel>
          ))}
          <Button
            variant="quiet"
            alignment="start"
            isDisabled={
              field.state.value.length >= roundPreparationLimits.criteriaCount || isSubmitting
            }
            data-add-criterion
            onPress={() => {
              const key = crypto.randomUUID();
              field.pushValue({ key, id: key, title: "", description: "" });
              setFocusRequest({ key, action: "title" });
            }}
          >
            <Icon name="add" />
            {t("preparation.addCriterion")}
          </Button>
        </div>
      )}
    </form.Field>
  );
};

const CriterionInputs = ({
  form,
  index,
  isReadOnly = false,
}: Pick<CriteriaFieldsProps, "form"> & { index: number; isReadOnly?: boolean }) => {
  const { t } = useTranslation("roundPreparation");
  return (
    <>
      <form.Field name={`criteria[${index}].title`}>
        {(title) => (
          <FormTextField
            field={title}
            label={t("preparation.criterionTitle")}
            autoFocus={index === 0}
            isRequired
            isReadOnly={isReadOnly}
            maxLength={roundPreparationLimits.criterionTitleLength}
          />
        )}
      </form.Field>
      <form.Field name={`criteria[${index}].description`}>
        {(description) => (
          <FormTextField
            field={description}
            label={t("preparation.guidance")}
            multiline
            rows={3}
            isReadOnly={isReadOnly}
            maxLength={roundPreparationLimits.criterionDescriptionLength}
          />
        )}
      </form.Field>
    </>
  );
};

const useCriterionFocus = (
  focusRequest: { key: string | null; action: "title" | "up" | "down" } | null,
  criterionId: string,
) => {
  const criteriaElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    const row =
      focusRequest.key === null
        ? null
        : criteriaElement.current?.querySelector<HTMLElement>(
            `#${CSS.escape(`${criterionId}-${focusRequest.key}`)}`,
          );
    const target =
      focusRequest.action === "title"
        ? row?.querySelector<HTMLInputElement>("input")
        : row?.querySelector<HTMLButtonElement>(
            `[data-criterion-action="${focusRequest.action}"]:not(:disabled)`,
          );
    (
      target ??
      row?.querySelector<HTMLInputElement>("input") ??
      criteriaElement.current?.querySelector<HTMLButtonElement>("[data-add-criterion]")
    )?.focus();
  }, [focusRequest, criterionId]);

  return criteriaElement;
};

const useCriterionAnnouncements = () => {
  const { t } = useTranslation("roundPreparation");
  const [announcement, setAnnouncement] = useState({ event: 0, message: null as string | null });
  return {
    announcement,
    moved: (title: string, number: number) =>
      setAnnouncement((previous) => ({
        event: previous.event + 1,
        message: t("preparation.criterionMoved", {
          title: title || t("preparation.untitledCriterion"),
          number,
        }),
      })),
    removed: (title: string) =>
      setAnnouncement((previous) => ({
        event: previous.event + 1,
        message: t("preparation.criterionRemoved", {
          title: title || t("preparation.untitledCriterion"),
        }),
      })),
  };
};
