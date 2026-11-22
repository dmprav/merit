import { spawnSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { selectCases, toolsForCase } from "./select.ts";

const usage =
  "Usage: vp run eval:mcp [codex|claude MODEL [--api-key]] [--workflow NAME] [--tool NAME] [--case ID] [--list]";
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    case: { type: "string", multiple: true },
    workflow: { type: "string", multiple: true },
    tool: { type: "string", multiple: true },
    list: { type: "boolean" },
    "api-key": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const run = () => {
  const [client, model] = positionals;
  if (values.help) {
    console.log(usage);
    return 0;
  }
  const scripted = positionals.length === 0 && !values["api-key"];
  const live =
    positionals.length === 2 && (client === "codex" || client === "claude") && model?.trim();
  if (!scripted && !live) {
    console.error(usage);
    return 2;
  }

  const cases = selectCases(values);
  if (values.list) {
    for (const item of cases) {
      console.log([item.id, item.workflow, toolsForCase(item).join(", ")].join("\t"));
    }
    console.log(`${cases.length} scenarios`);
    return 0;
  }
  const mode = client ?? "scripted";
  const directory = mkdtempSync(join(tmpdir(), `merit-mcp-${mode}-`));
  const output = join(directory, "report.json");
  console.log(`Report: ${output}`);
  console.log(`Running ${cases.length} MCP scenarios (${mode})`);
  const result = spawnSync("vp", ["test", "--config", "vitest.eval.config.ts"], {
    cwd: new URL("../../../", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      MERIT_EVAL_MODE: mode,
      MERIT_EVAL_CASES: JSON.stringify(cases.map((item) => item.id)),
      MERIT_EVAL_MODEL: model ?? "",
      MERIT_EVAL_AUTH: values["api-key"] ? "api-key" : "subscription",
      MERIT_EVAL_OUTPUT: output,
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (statSync(output, { throwIfNoEntry: false })?.size) {
    console.log(`Saved report: ${output}`);
    const report = spawnSync(process.execPath, ["app/tests/evals/mcp/report.ts", output], {
      stdio: "inherit",
    });
    if (report.error) {
      throw report.error;
    }
    if (report.status !== 0) {
      return report.status ?? 1;
    }
  }
  return result.status ?? 1;
};

try {
  process.exitCode = run();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not run MCP evals.");
  process.exitCode = 1;
}
