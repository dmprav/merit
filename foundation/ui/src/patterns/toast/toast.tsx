import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { Text } from "react-aria-components/Text";
import {
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
} from "react-aria-components/Toast";

import { ButtonBase } from "../../components/button/button-base";
import { IconBase } from "../../components/icon/icon-base";
import styles from "./toast.module.css";

const icons = {
  neutral: "info",
  success: "check",
  warning: "warning",
  danger: "warning",
} as const;

export type ToastMessage = {
  /** The same tones as Notice: success for a completed action, danger for a failure. */
  tone: keyof typeof icons;
  /** One short sentence, such as "Recommendation saved". */
  message: string;
  /** Called when the person dismisses the notification using its close button. */
  onDismiss?: () => void;
  /** One follow-up, such as Undo or Retry. Pressing it also dismisses the toast. */
  action?: { label: string; onPress: () => void };
};

const queue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 3 });

/**
 * Report the outcome of something the person did when the screen does not already show it.
 * A plain success disappears after four seconds; a toast with an action, or any other tone,
 * stays until the person dismisses it or acts, so nobody has to catch a recovery in time. Keep
 * failures of open input beside that input instead, and a page that cannot load in its place.
 */
export const showToast = (toast: ToastMessage) =>
  queue.add(toast, {
    timeout: toast.tone === "success" && !toast.action ? 4000 : undefined,
  });

/**
 * Show a toast each time a controller reports a new event, such as a save counter, so the
 * controller stays free of presentation. Each event replaces the previous event's toast, so an
 * earlier Undo cannot outlive a later save. The event present at mount is not shown again, and a
 * null toast only clears the previous one. Actionable toasts leave with their owner.
 */
export const useEventToast = (eventId: string | number, toast: ToastMessage | null) => {
  const shown = useRef(eventId);
  const previous = useRef<{ key: string; actionable: boolean } | null>(null);

  useEffect(
    () => () => {
      if (previous.current?.actionable) {
        queue.close(previous.current.key);
      }
    },
    [],
  );

  useEffect(() => {
    if (eventId === shown.current) {
      return;
    }
    shown.current = eventId;
    if (previous.current) {
      queue.close(previous.current.key);
    }
    previous.current = toast && { key: showToast(toast), actionable: Boolean(toast.action) };
  });
};

/**
 * Keep a toast up while a condition lasts, such as a failed refresh with its Refresh action. It
 * appears when the toast becomes non-null and leaves when it becomes null again or its owner
 * unmounts; the person can also dismiss it. Content changes while it is shown do not replace it.
 */
export const useToastWhile = (toast: ToastMessage | null) => {
  const active = toast !== null;
  const action = useRef(toast?.action);
  useLayoutEffect(() => {
    action.current = toast?.action;
  }, [toast?.action]);
  const show = useEffectEvent(
    () =>
      toast &&
      showToast({
        ...toast,
        action: toast.action && { ...toast.action, onPress: () => action.current?.onPress() },
      }),
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    const key = show();
    return () => {
      if (key) {
        queue.close(key);
      }
    };
  }, [active]);
};

/**
 * The page's single toast region, a landmark named Notifications that F6 reaches. Render it once
 * at the document root; it centers beside the application shell's sidebar. Unmounting it discards
 * its toasts.
 */
export const Toasts = () => {
  // Content mounted beside the region may show a toast before this effect runs, so only unmounting
  // clears the queue.
  useEffect(() => () => queue.clear(), []);

  return (
    <AriaToastRegion queue={queue} className={styles.region}>
      {({ toast }) => (
        <AriaToast toast={toast} className={styles.toast} data-tone={toast.content.tone}>
          <IconBase name={icons[toast.content.tone]} className={styles.icon} />
          <AriaToastContent className={styles.content}>
            <Text slot="title">{toast.content.message}</Text>
          </AriaToastContent>
          {toast.content.action && (
            <ButtonBase
              variant="quiet"
              size="small"
              onPress={() => {
                queue.close(toast.key);
                toast.content.action?.onPress();
              }}
            >
              {toast.content.action.label}
            </ButtonBase>
          )}
          {toast.timeout === undefined && (
            // React Aria names the close slot in the reader's language.
            <ButtonBase
              slot="close"
              variant="quiet"
              size="small"
              iconOnly
              onPress={toast.content.onDismiss}
            >
              <IconBase name="close" />
            </ButtonBase>
          )}
        </AriaToast>
      )}
    </AriaToastRegion>
  );
};
