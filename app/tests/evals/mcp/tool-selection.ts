import { readOnlyToolNames } from "@merit/mcp";

import type { EvalCase } from "./definition";
import type { ObservedCall, Scenario } from "./scenario";

export const gradeSelection = (
  item: EvalCase,
  scenario: Pick<Scenario, "allowDiscovery" | "acceptsError" | "checkSelection">,
  calls: readonly ObservedCall[],
) => {
  if (scenario.checkSelection) {
    return scenario.checkSelection(calls);
  }
  const allowDiscovery = scenario.allowDiscovery ?? item.tools.length > 0;
  const satisfied = new Set(
    calls
      .filter(
        (call) =>
          call.outcome.kind === "success" ||
          (call.outcome.kind === "error" && scenario.acceptsError?.(call)),
      )
      .map((call) => call.name),
  );
  const requirements = item.toolMatch === "any" ? [item.tools] : item.tools.map((name) => [name]);
  const issues = requirements
    .filter((options) => !options.some((name) => satisfied.has(name)))
    .map((options) => `Missed ${options.join(" or ")}`);
  const allowed = new Set([...item.tools, ...(item.optionalTools ?? [])]);
  for (const name of new Set(calls.map((call) => call.name))) {
    if (!allowed.has(name) && !(allowDiscovery && readOnlyToolNames.includes(name))) {
      issues.push(`Unexpected ${name}`);
    }
  }
  return issues;
};
