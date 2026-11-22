import type { UIMessage } from "@tanstack/ai-react";

export type MeritAiPart = UIMessage["parts"][number];

export type Turn = {
  /** Keeps the turn's place as its messages arrive. */
  id: string;
  author: "person" | "assistant";
  parts: MeritAiPart[];
};

/**
 * One turn per speaker. The client keeps each activity in a message of its own, so everything
 * between two questions is Merit AI's answer, read in the order it arrived.
 */
export const groupTurns = (messages: ReadonlyArray<UIMessage>): Turn[] =>
  messages.reduce<Turn[]>((turns, message) => {
    const author = message.role === "user" ? "person" : "assistant";
    const last = turns.at(-1);
    if (author === "assistant" && last?.author === "assistant") {
      last.parts.push(...message.parts);
    } else {
      turns.push({ id: message.id, author, parts: [...message.parts] });
    }
    return turns;
  }, []);

/** The latest call to a tool, by the id of its part. */
export const latestCallId = (turns: readonly Turn[], name: string) =>
  turns
    .flatMap((turn) => turn.parts)
    .findLast(
      (part): part is Extract<MeritAiPart, { type: "tool-call" }> =>
        part.type === "tool-call" && part.name === name,
    )?.id;
