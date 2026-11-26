import type { ComponentProps, ReactNode, Ref } from "react";
import { Heading } from "react-aria-components/Dialog";
import { useTranslation } from "react-i18next";

import scrollStyles from "../../foundations/scroll-area.module.css";
import { ButtonBase } from "../button/button-base";
import { IconBase } from "../icon/icon-base";
import styles from "./frame.module.css";

/**
 * Where a frame sits. Each placement sets one gutter, so header, body, feedback, and footer
 * share it: `center`, `end`, and `companion` use the dialog gutter, `popover` a tighter one,
 * and `pane` the workspace's inset.
 */
export type FramePlacement = "center" | "end" | "popover" | "companion" | "pane";

/** Props that make an element the root of a frame; pass extra classes for placement-specific layout. */
export const frameRoot = (placement: FramePlacement, className?: string) => ({
  className: className ? `${styles.frame} ${className}` : styles.frame,
  "data-frame": placement,
});

/**
 * The header bar. Its edge appears once the body scrolls under it. `actions` are the trailing
 * controls, outdented so a close glyph ends at the gutter.
 */
export const FrameBar = ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
  <div className={`${styles.header} ${scrollStyles.dividerAfterStart}`} data-dialog-header>
    {children}
    {actions && <div className={styles.actions}>{actions}</div>}
  </div>
);

/**
 * The title with optional context and status beside it. Renders the dialog's accessible
 * heading unless `plain` asks for an ordinary heading outside a React Aria dialog.
 */
export const FrameTitle = ({
  title,
  plain = false,
  titleId,
  titleRef,
  focusable = false,
  context,
  contextLabel,
  meta,
}: {
  title: ReactNode;
  plain?: boolean;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  /** Lets code move focus to the title, such as when a pane's task opens. */
  focusable?: boolean;
  /** Fixed parent context that orients the task. */
  context?: string;
  /** Localized relationship label, such as “Round”. */
  contextLabel?: string;
  /** Compact status beside the title. */
  meta?: ReactNode;
}) => (
  <div className={styles.heading}>
    {plain ? (
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={focusable ? -1 : undefined}
        className={styles.title}
      >
        {title}
      </h2>
    ) : (
      <Heading slot="title" className={styles.title}>
        {title}
      </Heading>
    )}
    {meta}
    {context && (
      <span className={styles.context} data-dialog-context>
        {contextLabel && <>{contextLabel}: </>}
        {context}
      </span>
    )}
  </div>
);

/** The header of a dialog, side panel, popover, or companion: title, optional context, and close. */
export const FrameHeader = ({
  title,
  titleId,
  context,
  contextLabel,
  closeLabel,
  isDismissDisabled,
  close,
  actions,
}: {
  title: string;
  titleId?: string;
  context?: string;
  contextLabel?: string;
  /** Defaults to the shared “Close dialog” message. */
  closeLabel?: string;
  isDismissDisabled?: boolean;
  close: () => void;
  /** Utilities before the close control. */
  actions?: ReactNode;
}) => {
  const { t } = useTranslation("common");

  return (
    <FrameBar
      actions={
        <>
          {actions}
          <ButtonBase
            slot={null}
            variant="quiet"
            iconOnly
            aria-label={closeLabel ?? t("closeDialog")}
            isDisabled={isDismissDisabled}
            onPress={close}
          >
            <IconBase name="close" />
          </ButtonBase>
        </>
      }
    >
      <FrameTitle
        title={title}
        plain={titleId !== undefined}
        titleId={titleId}
        context={context}
        contextLabel={contextLabel}
      />
    </FrameBar>
  );
};

/**
 * The only part of a frame that scrolls. Keyboard-scrollable and named by `label`. `framed`
 * gives it the frame's gutters; nested content leaves them to its surroundings.
 */
export const FrameBody = ({
  framed = true,
  reading = false,
  children,
  ...props
}: Omit<ComponentProps<"div">, "className"> & {
  framed?: boolean;
  reading?: boolean;
}) => (
  <div
    {...props}
    className={styles.body}
    data-framed={framed || undefined}
    data-reading={reading || undefined}
    data-frame-body
  >
    {children}
  </div>
);

/** Wraps a body with its footer where a frame's children supply both, as `DialogContent` does. */
export const FrameContent = ({
  framed,
  children,
  ...props
}: Omit<ComponentProps<"div">, "className"> & { framed: boolean }) => (
  <div {...props} className={styles.content} data-framed={framed || undefined}>
    {children}
  </div>
);

/**
 * The fixed footer area: feedback above the actions, so an outcome sits directly over the
 * button that caused it. Its edge shows while content continues below. `sticky` keeps it in view
 * at the end of a pane that scrolls around it.
 */
export const FrameFooter = ({
  framed = true,
  sticky = false,
  feedback,
  children,
}: {
  framed?: boolean;
  sticky?: boolean;
  /** Persistent outcome feedback above the actions. */
  feedback?: ReactNode;
  children?: ReactNode;
}) =>
  (feedback || children) && (
    <div
      className={`${styles.footer} ${scrollStyles.dividerUntilEnd}`}
      data-framed={framed || undefined}
      data-sticky={sticky || undefined}
      data-frame-footer
    >
      {feedback && (
        <div className={styles.feedback} data-dialog-feedback>
          {feedback}
        </div>
      )}
      {children && (
        <div className={styles.footerActions} data-dialog-footer>
          {children}
        </div>
      )}
    </div>
  );
