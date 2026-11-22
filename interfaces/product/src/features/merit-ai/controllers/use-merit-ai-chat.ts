import type { AnyClientTool, ConnectConnectionAdapter } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useRef, useState } from "react";

import type { PageContext } from "../contracts";
import { groupTurns } from "./turns";

/**
 * The conversation with Merit AI. The caller supplies the connection, so a scripted one and a
 * server's behave alike. The draft and what was stopped live here, above the panel, because the
 * panel remounts when the screen crosses 1400 pixels.
 */
export const useMeritAiChat = ({
  connection,
  tools,
  context,
}: {
  connection: ConnectConnectionAdapter;
  /** The tools whose interrupts the person can decide. */
  tools: ReadonlyArray<AnyClientTool>;
  /** What the open page tells Merit AI, while the person keeps it attached. */
  context: PageContext | undefined;
}) => {
  const [threadId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState("");
  const [stoppedAt, setStoppedAt] = useState<string | null>(null);
  const chat = useChat({ connection, threadId, tools });
  const waiting = useRef<{ text: string; context: PageContext | undefined } | null>(null);
  const hasProposal = chat.interrupts.length > 0;
  const canSend = !hasProposal && !chat.resuming && !chat.isLoading;

  const deliver = (text: string, about: PageContext | undefined) =>
    void chat.sendMessage(text, about ? { body: { context: about } } : undefined);

  // The client accepts no new question until the proposal's decision has been recorded.
  useEffect(() => {
    if (waiting.current && canSend) {
      const { text, context: about } = waiting.current;
      waiting.current = null;
      deliver(text, about);
    }
  });

  const send = (text: string) => {
    setStoppedAt(null);
    setDraft("");
    // A proposal that is still waiting gives way to the new question: it is declined first.
    if (hasProposal) {
      waiting.current = { text, context };
      chat.resolveInterrupts(false);
      return;
    }
    deliver(text, context);
  };

  const stop = () => {
    setStoppedAt(groupTurns(chat.messages).at(-1)?.id ?? null);
    chat.stop();
  };

  const decide = (approved: boolean) => chat.resolveInterrupts(approved);

  return {
    turns: groupTurns(chat.messages),
    isBusy: chat.isLoading || chat.resuming,
    resuming: chat.resuming,
    failed: chat.error !== undefined,
    draft,
    setDraft,
    stoppedAt,
    decisionFailed: chat.interruptErrors.length > 0,
    send,
    stop,
    retry: () => {
      setStoppedAt(null);
      void chat.reload();
    },
    approve: () => decide(true),
    decline: () => decide(false),
    retryDecision: chat.retryInterrupts,
  };
};
