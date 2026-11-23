import { useTranslation } from "react-i18next";

import { ButtonBase } from "../../components/button/button-base";
import { IconBase } from "../../components/icon/icon-base";
import { LoadingIconBase } from "../../components/icon/loading-icon-base";
import styles from "./editor-loading.module.css";

/**
 * Compact recovery feedback inside the editor's existing padded body. Keep its title and Close
 * available. Alone in a dialog body it is centered in a stable space; it fades in after a short
 * delay so quick recoveries do not flash.
 */
export const EditorLoading = () => {
  const { t } = useTranslation("common");
  return (
    <span className={styles.loading} role="status" data-body-state>
      <LoadingIconBase className={styles.spinner} />
      <span className={styles.copy}>
        <span className={styles.title}>{t("editorPreparing")}</span>
        <span className={styles.description}>{t("editorPreparingDescription")}</span>
      </span>
    </span>
  );
};

/** Closes an inline editor by pointer or Escape; focus it while fields are unavailable. */
export const EditorClose = ({
  label,
  onClose,
  iconOnly = false,
  autoFocus = true,
  isDisabled = false,
}: {
  label: string;
  onClose: () => void;
  iconOnly?: boolean;
  autoFocus?: boolean;
  isDisabled?: boolean;
}) => (
  <ButtonBase
    autoFocus={autoFocus}
    isDisabled={isDisabled}
    variant="quiet"
    iconOnly={iconOnly}
    aria-label={label}
    onPress={onClose}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !isDisabled) {
        event.preventDefault();
        onClose();
      }
    }}
  >
    {iconOnly ? <IconBase name="close" /> : label}
  </ButtonBase>
);
