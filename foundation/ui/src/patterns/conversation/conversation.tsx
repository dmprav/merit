import type { ReactNode } from "react";

import { VisuallyHidden } from "../../components/visually-hidden/visually-hidden";
import styles from "./conversation.module.css";

/**
 * The thread of an assistant conversation, in the order the messages were sent. It is a labelled
 * log that stays silent while text streams in: announce each finished answer with StatusMessage
 * instead of reading every word.
 */
export const Conversation = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="log" aria-live="off" aria-label={label}>
    <ol className={styles.thread}>{children}</ol>
  </div>
);

/**
 * One turn of the conversation. A person's message sits right-aligned on a muted fill, at most
 * 85% of the width. An assistant's answer is plain content at reading line height, with its blocks
 * (text, activity, proposals, notices) spaced apart. authorLabel names the author for assistive
 * technology; it is not shown.
 */
export const ConversationMessage = ({
  author,
  authorLabel,
  children,
}: {
  author: "person" | "assistant";
  authorLabel: string;
  children: ReactNode;
}) => (
  <li className={styles.message} data-author={author}>
    <VisuallyHidden>{authorLabel}</VisuallyHidden>
    <div className={styles.content}>{children}</div>
  </li>
);
