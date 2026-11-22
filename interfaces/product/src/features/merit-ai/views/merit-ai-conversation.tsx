import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Conversation, ConversationMessage } from "@merit/ui/conversation";
import { MessageBox } from "@merit/ui/message-box";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";

import { scriptIds } from "../contracts";
import type { Turn } from "../controllers/turns";
import type { useMeritAiChat } from "../controllers/use-merit-ai-chat";
import styles from "./merit-ai.module.css";
import { Suggestions } from "./suggestions";
import { TurnContent, type TurnActions } from "./turn-content";
import { useFollowEnd } from "./use-follow-end";

export type MeritAiChat = ReturnType<typeof useMeritAiChat>;

type Chip = { title: string; onRemove: () => void };

const answerText = (turn: Turn | undefined) =>
  turn?.author === "assistant"
    ? turn.parts.map((part) => (part.type === "text" ? part.content : "")).join("")
    : "";

/** What to say aloud for an announcement, or nothing. */
const useSpokenText = (chat: MeritAiChat) => {
  const { t } = useTranslation("meritAi");
  // What was announced before this panel mounted is not said again when it remounts.
  const [heard] = useState(chat.announcement?.sequence ?? 0);
  const { announcement } = chat;
  if (!announcement || announcement.sequence <= heard) {
    return null;
  }
  if (announcement.kind === "answer") {
    return answerText(chat.turns.find((turn) => turn.id === announcement.turnId)) || null;
  }
  return announcement.kind === "approved"
    ? `${t("proposal.approved")}. ${t("proposal.demoNotice")}`
    : t("proposal.declined");
};

const Notices = ({
  isStopped,
  hasFailed,
  onRetry,
}: {
  isStopped: boolean;
  hasFailed: boolean;
  onRetry: () => void;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <>
      {isStopped && <Notice tone="neutral">{t("stopped")}</Notice>}
      {hasFailed && (
        <Notice
          tone="danger"
          role="alert"
          actions={
            <Button variant="secondary" onPress={onRetry}>
              {t("retry")}
            </Button>
          }
        >
          {t("failed")}
        </Notice>
      )}
    </>
  );
};

const Thread = ({ chat, actions }: { chat: MeritAiChat; actions: TurnActions }) => {
  const { t } = useTranslation("meritAi");
  const last = chat.turns.at(-1);
  const isStopped = !chat.isBusy && chat.stoppedAt !== null && chat.stoppedAt === last?.id;
  const hasFailed = !chat.isBusy && chat.failed && !isStopped;
  const notices = <Notices isStopped={isStopped} hasFailed={hasFailed} onRetry={chat.retry} />;

  return (
    <Conversation label={t("conversation")}>
      {chat.turns.map((turn) => (
        <ConversationMessage
          key={turn.id}
          author={turn.author}
          authorLabel={t(`authors.${turn.author}`)}
        >
          {turn.author === "person" ? (
            turn.parts.map((part) =>
              part.type === "text" ? <p key={part.content}>{part.content}</p> : null,
            )
          ) : (
            <>
              <TurnContent
                turn={turn}
                actions={{
                  ...actions,
                  isLive: actions.isLive && turn === last,
                  isSettled: actions.isSettled && turn === last,
                }}
              />
              {turn === last && notices}
            </>
          )}
        </ConversationMessage>
      ))}
      {/* A question stopped or failed before any answer began still gets its notice. */}
      {(isStopped || hasFailed) && last?.author === "person" && (
        <ConversationMessage author="assistant" authorLabel={t("authors.assistant")}>
          {notices}
        </ConversationMessage>
      )}
    </Conversation>
  );
};

/** The panel's footer: the box to ask in, with the page attached as context. */
export const MeritAiComposer = ({
  chat,
  chip,
  onSend,
  boxRef,
}: {
  chat: MeritAiChat;
  chip: Chip | undefined;
  onSend: (text: string) => void;
  /** Wraps the box, so the conversation can return focus to it. */
  boxRef: RefObject<HTMLDivElement | null>;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <div ref={boxRef}>
      <MessageBox
        label={t("message.label")}
        isLabelHidden
        description={t("message.description")}
        value={chat.draft}
        onChange={chat.setDraft}
        sendLabel={t("message.send")}
        onSend={onSend}
        isBusy={chat.isBusy}
        stopLabel={t("message.stop")}
        onStop={chat.stop}
        chips={
          chip && [
            {
              id: "page",
              label: chip.title,
              removeLabel: t("message.removeContext", { title: chip.title }),
              onRemove: chip.onRemove,
            },
          ]
        }
        autoFocus
      />
    </div>
  );
};

/**
 * The panel's content: the thread and the suggestions that apply. The panel's body scrolls it, so
 * the box to ask in can stay below in the footer.
 */
export const MeritAiConversation = ({
  chat,
  canSuggest,
  onAsk,
}: {
  chat: MeritAiChat;
  /** The Workshop Saturdays page is open with its chip attached, so recorded questions apply. */
  canSuggest: boolean;
  /** Asks a question and returns focus to the box, as typing it there would. */
  onAsk: (question: string) => void;
}) => {
  const lastQuestion = chat.turns.findLast((turn) => turn.author === "person");
  const thread = useFollowEnd(lastQuestion?.id);
  const actions: TurnActions = {
    isLive: chat.isBusy,
    isSettled: !chat.isBusy,
    openProposal: chat.openProposal,
    recording: chat.recording,
    decisionFailed: chat.decisionFailed,
    onApprove: chat.approve,
    onDecline: chat.decline,
    onChoose: onAsk,
  };
  const spoken = useSpokenText(chat);

  return (
    <div ref={thread} className={styles.thread}>
      <Thread chat={chat} actions={actions} />
      {chat.turns.length === 0 && canSuggest && (
        <Suggestions scripts={scriptIds} onChoose={onAsk} />
      )}
      <StatusMessage message={spoken} eventId={chat.announcement?.sequence ?? 0} />
    </div>
  );
};
