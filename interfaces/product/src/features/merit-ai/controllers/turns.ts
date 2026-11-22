import type { MeritAiMessage } from "./chat-types";

export type MeritAiPart = MeritAiMessage["parts"][number];

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
export const groupTurns = (messages: ReadonlyArray<MeritAiMessage>): Turn[] =>
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
