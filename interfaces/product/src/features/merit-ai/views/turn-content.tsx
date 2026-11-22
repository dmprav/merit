import { z } from "zod";

import { stepActivity, suggestionsActivity, type StepContent } from "../contracts";
import { askApplicantInput, askApplicantName } from "../contracts";
import type { MeritAiPart, Turn } from "../controllers/turns";
import { ActivitySteps } from "./activity-steps";
import { Proposal, type ProposalDecision } from "./proposal";
import { Suggestions } from "./suggestions";

const stepSchema = z.object({
  label: z.string(),
  summary: z.string(),
  status: z.enum(["running", "done"]),
});

const suggestionsSchema = z.object({ scripts: z.array(z.enum(["changes", "venue"])) });

/** What the conversation lets a turn do: its live state and the person's decisions. */
export type TurnActions = {
  /** This turn is the latest and its run is still going. */
  isLive: boolean;
  /** This turn is the latest and nothing is running. */
  isSettled: boolean;
  isResolving: boolean;
  decisionFailed: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onRetryDecision: () => void;
  onChoose: (question: string) => void;
};

/** Consecutive steps share one block; every other part is a block of its own. */
type Block = { type: "steps"; steps: StepContent[] } | { type: "part"; part: MeritAiPart };

const toBlocks = (parts: readonly MeritAiPart[]) =>
  parts.reduce<Block[]>((blocks, part) => {
    const step =
      part.type === "activity" && part.activityType === stepActivity
        ? stepSchema.safeParse(part.content)
        : undefined;
    const last = blocks.at(-1);
    if (!step?.success) {
      blocks.push({ type: "part", part });
    } else if (last?.type === "steps") {
      last.steps.push(step.data);
    } else {
      blocks.push({ type: "steps", steps: [step.data] });
    }
    return blocks;
  }, []);

const decisionOf = (part: Extract<MeritAiPart, { type: "tool-call" }>): ProposalDecision => {
  if (part.approval?.approved === undefined) {
    return "awaiting";
  }
  return part.approval.approved ? "approved" : "declined";
};

const Paragraphs = ({ text }: { text: string }) =>
  text.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>);

const PartView = ({ part, actions }: { part: MeritAiPart; actions: TurnActions }) => {
  switch (part.type) {
    case "text":
      return <Paragraphs text={part.content} />;
    case "tool-call": {
      const proposal = askApplicantInput.safeParse(part.input);
      return part.name === askApplicantName && proposal.success ? (
        <Proposal
          proposal={proposal.data}
          decision={decisionOf(part)}
          isResolving={actions.isResolving}
          hasFailed={actions.decisionFailed}
          onApprove={actions.onApprove}
          onDecline={actions.onDecline}
          onRetry={actions.onRetryDecision}
        />
      ) : null;
    }
    case "activity": {
      const suggestions =
        part.activityType === suggestionsActivity
          ? suggestionsSchema.safeParse(part.content)
          : undefined;
      // Suggestions belong to the latest answer; once the conversation moves on they would mislead.
      return suggestions?.success && actions.isSettled ? (
        <Suggestions scripts={suggestions.data.scripts} onChoose={actions.onChoose} />
      ) : null;
    }
    default:
      return null;
  }
};

/** One switch over what a turn is made of, in the order it arrived. */
export const TurnContent = ({ turn, actions }: { turn: Turn; actions: TurnActions }) => {
  const blocks = toBlocks(turn.parts);

  return blocks.map((block, index) => {
    if (block.type === "part") {
      return <PartView key={`${block.part.type}-${index}`} part={block.part} actions={actions} />;
    }
    const answerStarted = blocks
      .slice(index + 1)
      .some((later) => later.type === "part" && later.part.type === "text");
    return (
      <ActivitySteps
        key={`steps-${index}`}
        steps={block.steps}
        isLive={actions.isLive}
        isWorking={actions.isLive && !answerStarted}
      />
    );
  });
};
