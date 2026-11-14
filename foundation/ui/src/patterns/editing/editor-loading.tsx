import { useTranslation } from "react-i18next";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import styles from "./editor-loading.module.css";

/** Compact recovery feedback inside the editor's existing padded body. Keep its title and Close available. */
export const EditorLoading = () => {
  const { t } = useTranslation("common");
  return (
    <span className={styles.loading} role="status">
      <Icon name="loading" className={styles.spinner} />
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
  <Button
    autoFocus={autoFocus}
    isDisabled={isDisabled}
    size="small"
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
    {iconOnly ? <Icon name="close" /> : label}
  </Button>
);
