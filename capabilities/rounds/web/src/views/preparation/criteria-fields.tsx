import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FormTextField, type useForm } from "@merit/forms";
import { roundPreparationLimits } from "@merit/rounds/domain";
import { Button } from "@merit/ui/button";
import { StatusMessage } from "@merit/ui/status-message";

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

  const criteriaElement = useCriterionFocus(focusRequest);

  return (
    <form.Field name="criteria" mode="array">
      {(field) => (
        <div className={styles.fields} ref={criteriaElement}>
          <StatusMessage eventId={announcement.event} message={announcement.message} />
          {field.state.value.map((criterion, index) => (
            <fieldset
              key={criterion.key}
              data-criterion-key={criterion.key}
              className={styles.criterion}
            >
              <legend>{t("preparation.criterion", { number: index + 1 })}</legend>
              <CriterionInputs form={form} index={index} />
              <div className={styles.actions}>
                <Button
                  size="small"
                  variant="quiet"
                  isDisabled={index === 0 || isSubmitting}
                  aria-label={t("preparation.moveUpFor", { number: index + 1 })}
                  data-criterion-action="up"
                  onPress={() => {
                    field.swapValues(index, index - 1);
                    setFocusRequest({ key: criterion.key, action: "up" });
                    moved(criterion.title, index);
                  }}
                >
                  {t("preparation.moveUp")}
                </Button>
                <Button
                  size="small"
                  variant="quiet"
                  isDisabled={index === field.state.value.length - 1 || isSubmitting}
                  aria-label={t("preparation.moveDownFor", { number: index + 1 })}
                  data-criterion-action="down"
                  onPress={() => {
                    field.swapValues(index, index + 1);
                    setFocusRequest({ key: criterion.key, action: "down" });
                    moved(criterion.title, index + 2);
                  }}
                >
                  {t("preparation.moveDown")}
                </Button>
                <Button
                  size="small"
                  variant="quiet"
                  isDisabled={isSubmitting}
                  aria-label={t("preparation.removeFor", { number: index + 1 })}
                  onPress={() => {
                    const next = field.state.value[index + 1] ?? field.state.value[index - 1];
                    field.removeValue(index);
                    setFocusRequest({ key: next?.key ?? null, action: "title" });
                    removed(criterion.title);
                  }}
                >
                  {t("preparation.remove")}
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            size="small"
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
}: Pick<CriteriaFieldsProps, "form"> & { index: number }) => {
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
            maxLength={roundPreparationLimits.criterionDescriptionLength}
          />
        )}
      </form.Field>
    </>
  );
};

const useCriterionFocus = (
  focusRequest: { key: string | null; action: "title" | "up" | "down" } | null,
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
            `[data-criterion-key="${focusRequest.key}"]`,
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
  }, [focusRequest]);

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
