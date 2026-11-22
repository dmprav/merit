import type { EvalCase } from "./definition";
import type { TrialResult } from "./result";
import type { Scenario, ObservedCall } from "./scenario";
import { gradeSelection } from "./tool-selection";

const assertionIssue = async (check: () => void | Promise<void>) => {
  try {
    await check();
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AssertionError") {
      throw error;
    }
    return error.message;
  }
  return undefined;
};

type Trial = {
  scenario: Scenario;
  server: { trace: ObservedCall[]; url: string; discovered: () => boolean };
  recipients: string[];
};

export const gradeTrial = async (
  item: EvalCase,
  { scenario, server, recipients }: Trial,
  reply: string,
): Promise<TrialResult> => {
  const selection = gradeSelection(item, scenario, server.trace);
  if (!server.discovered()) {
    selection.push("Merit catalog was not discovered");
  }
  const observed = await assertionIssue(() => scenario.verifyTrace?.(server.trace));
  if (observed !== undefined) {
    selection.push(observed);
  }
  const effect = await assertionIssue(() => scenario.verifyEffects?.());
  const verifyReply = scenario.verifyReply;
  const issue = verifyReply && (await assertionIssue(() => verifyReply(reply, server.url)));
  return {
    id: item.id,
    prompt: item.prompt,
    replyCriterion: scenario.manualReplyCriterion ?? item.replyCriterion ?? item.outcome,
    observation: { kind: "workflow", trace: server.trace, recipients: [...recipients], reply },
    grade: {
      selection,
      effects: scenario.verifyEffects ? (effect === undefined ? [] : [effect]) : null,
      reply:
        issue !== undefined
          ? { status: "failed", issue }
          : {
              status: !verifyReply
                ? "pending"
                : scenario.manualReplyCriterion
                  ? "partial"
                  : "passed",
            },
    },
  };
};
