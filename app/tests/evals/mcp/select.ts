import { evalCases } from "./registry.ts";

type Filters = { case?: string[]; workflow?: string[]; tool?: string[] };

export const toolsForCase = (item: (typeof evalCases)[number]) => [
  ...new Set([...item.tools, ...(item.optionalTools ?? []), ...(item.relatedTools ?? [])]),
];

export const selectCases = (filters: Filters) => {
  const values = {
    case: evalCases.map((item) => item.id),
    workflow: evalCases.map((item) => item.workflow),
    tool: evalCases.flatMap(toolsForCase),
  };
  for (const key of ["case", "workflow", "tool"] as const) {
    for (const value of filters[key] ?? []) {
      if (!values[key].includes(value)) {
        throw new Error(`Unknown ${key}: ${value}. Use --list to see the inventory.`);
      }
    }
  }
  const selected = evalCases.filter(
    (item) =>
      (!filters.case || filters.case.includes(item.id)) &&
      (!filters.workflow || filters.workflow.includes(item.workflow)) &&
      (!filters.tool || toolsForCase(item).some((tool) => filters.tool?.includes(tool))),
  );
  if (!selected.length) {
    throw new Error("No scenarios match these filters.");
  }
  return selected;
};
