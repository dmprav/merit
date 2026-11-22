import { Heading } from "react-aria-components/Dialog";
import { useTranslation } from "react-i18next";

import scrollStyles from "../../foundations/scroll-area.module.css";
import { ButtonBase } from "../button/button-base";
import { IconBase } from "../icon/icon-base";
import styles from "./framed-dialog.module.css";

/**
 * The header of a framed dialog or side panel: title, optional context, and a close button. For
 * modules inside this package. Pass `titleId` to render a plain heading for a surface that is
 * not a React Aria dialog.
 */
export const FramedHeader = ({
  title,
  titleId,
  context,
  contextLabel,
  closeLabel,
  isDismissDisabled,
  close,
}: {
  title: string;
  titleId?: string;
  /** Fixed parent context that orients the task. */
  context?: string;
  /** Localized relationship label, such as “Round”. */
  contextLabel?: string;
  closeLabel?: string;
  isDismissDisabled?: boolean;
  close: () => void;
}) => {
  const { t } = useTranslation("common");

  return (
    <div className={`${styles.header} ${scrollStyles.dividerAfterStart}`} data-dialog-header>
      <div className={styles.heading}>
        {titleId ? (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        ) : (
          <Heading slot="title" className={styles.title}>
            {title}
          </Heading>
        )}
        {context && (
          <span className={styles.context} data-dialog-context>
            {contextLabel && <>{contextLabel}: </>}
            {context}
          </span>
        )}
      </div>
      <ButtonBase
        variant="quiet"
        iconOnly
        aria-label={closeLabel ?? t("closeDialog")}
        isDisabled={isDismissDisabled}
        onPress={close}
        className={styles.close}
      >
        <IconBase name="close" />
      </ButtonBase>
    </div>
  );
};
