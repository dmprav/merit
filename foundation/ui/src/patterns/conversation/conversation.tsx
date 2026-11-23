import type { ReactNode } from "react";

import { ButtonBase } from "../../components/button/button-base";
import { IconBase, type IconName } from "../../components/icon/icon-base";
import { Tooltip } from "../../components/tooltip/tooltip";
import { VisuallyHidden } from "../../components/visually-hidden/visually-hidden";
import styles from "./conversation.module.css";
import { useFollowEnd } from "./use-follow-end";

/**
 * The thread of an assistant conversation, in the order the messages were sent. It is a labelled
 * log that stays silent while text streams in: announce each finished answer with StatusMessage
 * instead of reading every word. In a scrolling container it stays scrolled to its end while the
 * person reads the end, and leaves the scroll where they put it once they scroll up.
 */
export const Conversation = ({
  label,
  followKey,
  children,
}: {
  label: string;
  /** Changes with each question the person asks, so the thread follows its end again. */
  followKey?: string;
  children: ReactNode;
}) => {
  const log = useFollowEnd(followKey);

  return (
    <div ref={log} role="log" aria-live="off" aria-label={label}>
      <ol className={styles.thread}>{children}</ol>
    </div>
  );
};

/**
 * One turn of the conversation. A person's message sits right-aligned on a muted fill, at most
 * 85% of the width. An assistant's answer is plain content at reading line height, with its blocks
 * (text, activity, proposals, notices) spaced apart. authorLabel names the author for assistive
 * technology; it is not shown. actions is a quiet row of ConversationActions below an answer: it
 * shows on the latest message, and on others while they are hovered or hold focus.
 */
export const ConversationMessage = ({
  author,
  authorLabel,
  actions,
  children,
}: {
  author: "person" | "assistant";
  authorLabel: string;
  /** ConversationActions for this message, such as copying or retrying an answer. */
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <li className={styles.message} data-author={author}>
    <VisuallyHidden>{authorLabel}</VisuallyHidden>
    <div className={styles.content}>{children}</div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </li>
);

/** One command in a message's actions: an icon named by its label, which a tooltip also shows. */
export const ConversationAction = ({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) => (
  <Tooltip content={label}>
    <ButtonBase variant="quiet" iconOnly aria-label={label} onPress={onPress}>
      <IconBase name={icon} />
    </ButtonBase>
  </Tooltip>
);
