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

const Composer = ({
  chat,
  chip,
  onSend,
}: {
  chat: MeritAiChat;
  chip: Chip | undefined;
  onSend: (text: string) => void;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <div className={styles.composer}>
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

/** The panel's content: the thread, the suggestions that apply, and the box to ask in. */
export const MeritAiConversation = ({
  chat,
  chip,
  canSuggest,
}: {
  chat: MeritAiChat;
  /** The page attached to the next question, as a removable chip. */
  chip: Chip | undefined;
  /** The Workshop Saturdays page is open with its chip attached, so recorded questions apply. */
  canSuggest: boolean;
}) => {
  const { t } = useTranslation("meritAi");
  const { scroller, onScroll, follow } = useFollowEnd(chat.turns);

  const ask = (question: string) => {
    follow();
    chat.send(question);
  };

  const actions: TurnActions = {
    isLive: chat.isBusy,
    isSettled: !chat.isBusy,
    isResolving: chat.resuming,
    decisionFailed: chat.decisionFailed,
    onApprove: chat.approve,
    onDecline: chat.decline,
    onRetryDecision: chat.retryDecision,
    onChoose: ask,
  };
  const answer = chat.isBusy ? undefined : chat.turns.at(-1);

  return (
    <div className={styles.conversation}>
      <div
        ref={scroller}
        role="region"
        aria-label={t("messages")}
        tabIndex={0}
        className={styles.scroller}
        onScroll={onScroll}
      >
        <Thread chat={chat} actions={actions} />
        {chat.turns.length === 0 && canSuggest && (
          <Suggestions scripts={scriptIds} onChoose={ask} />
        )}
      </div>
      <Composer chat={chat} chip={chip} onSend={ask} />
      <StatusMessage message={answerText(answer) || null} eventId={answer?.id ?? "none"} />
    </div>
  );
};
