import type { AnyClientTool, ConnectConnectionAdapter } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useRef, useState } from "react";

import type { PageContext } from "../contracts";
import { askApplicantName } from "../contracts";
import { groupTurns, latestCallId, type Turn } from "./turns";

/**
 * Something for assistive technology to announce once: a finished answer, or the outcome of the
 * person's decision. The sequence orders them, so a panel that mounts later can tell what it
 * has missed from what it was never meant to say again.
 */
type Announcement =
  | { sequence: number; kind: "answer"; turnId: string | undefined }
  | { sequence: number; kind: "approved" | "declined" };

/** An announcement before it is given its place in the sequence. */
type Pending = { kind: "answer"; turnId: string | undefined } | { kind: "approved" | "declined" };

/** What the run that records a decision is for; a new question that declines a proposal is one. */
type Deciding = "approved" | "declined" | "replaced";

type Chat = ReturnType<typeof useChat>;

/** Runs `onSettled` in the render where work that was going has stopped. */
const useWhenSettled = (isBusy: boolean, onSettled: () => void) => {
  const [wasBusy, setWasBusy] = useState(false);
  if (isBusy !== wasBusy) {
    setWasBusy(isBusy);
    if (wasBusy) {
      onSettled();
    }
  }
};

/** What a run that has settled has to say: its answer, or the outcome of a recorded decision. */
const announcementAfter = (
  deciding: Deciding | null,
  failed: boolean,
  turnId: string | undefined,
): Pending | null => {
  if (deciding === null) {
    return { kind: "answer", turnId };
  }
  // The outcome is the person's to hear once it is recorded, not while it is pending, and a new
  // question that declined the proposal brings its own answer.
  return deciding === "replaced" || failed ? null : { kind: deciding };
};

/**
 * What the person's decisions on a proposal leave behind: the choice being recorded, the proposal
 * that stays open until a choice is recorded, and what to announce once a run settles. The run
 * that records a decision ends without a new answer, so it announces the outcome instead.
 */
const useDecisions = (chat: Chat, turns: readonly Turn[], isBusy: boolean) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [deciding, setDeciding] = useState<Deciding | null>(null);
  // The proposal whose decision is being recorded, or could not be: it stays open for another try.
  const [unrecorded, setUnrecorded] = useState<string | null>(null);
  const proposal = latestCallId(turns, askApplicantName);

  useWhenSettled(isBusy, () => {
    const failed = chat.interruptErrors.length > 0;
    setDeciding(null);
    setUnrecorded(failed ? unrecorded : null);
    const next = announcementAfter(deciding, failed, turns.at(-1)?.id);
    if (next) {
      setAnnouncement({ sequence: (announcement?.sequence ?? 0) + 1, ...next });
    }
  });

  return {
    announcement,
    recording: chat.resuming && deciding !== "replaced" ? deciding : null,
    /** The proposal still waiting for a decision, or for one to be recorded. */
    openProposal: unrecorded ?? (chat.interrupts.length > 0 ? proposal : undefined),
    begin: (choice: "approved" | "declined") => {
      setDeciding(choice);
      setUnrecorded(proposal ?? unrecorded);
    },
    replace: () => setDeciding("replaced"),
  };
};

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
  const turns = groupTurns(chat.messages);
  const isBusy = chat.isLoading || chat.resuming;

  const decisions = useDecisions(chat, turns, isBusy);
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
      decisions.replace();
      chat.resolveInterrupts(false);
      return;
    }
    deliver(text, context);
  };

  const stop = () => {
    setStoppedAt(groupTurns(chat.messages).at(-1)?.id ?? null);
    chat.stop();
  };

  const decide = (approved: boolean) => {
    decisions.begin(approved ? "approved" : "declined");
    chat.resolveInterrupts(approved);
  };

  return {
    turns,
    isBusy,
    recording: decisions.recording,
    announcement: decisions.announcement,
    openProposal: decisions.openProposal,
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
  };
};
