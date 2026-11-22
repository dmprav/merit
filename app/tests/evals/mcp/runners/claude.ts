import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { runCli, withTrialDirectory, type TrialInput } from "./process";

const loginSchema = z.object({ loggedIn: z.literal(true), authMethod: z.literal("claude.ai") });
const resultSchema = z.object({
  type: z.literal("result"),
  subtype: z.literal("success"),
  is_error: z.literal(false),
  result: z.string().trim().min(1),
  permission_denials: z.array(z.unknown()),
});

// JSON.parse errors can include raw client output. Return only the schema-specific error below.
const parseOutput = (output: string): unknown => {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
};

export const runClaude = (input: TrialInput & { meritUserId: string }) =>
  withTrialDirectory(async (cwd) => {
    const env: NodeJS.ProcessEnv = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      // Claude uses USER to find the signed-in account in the macOS Keychain.
      USER: process.env.USER,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };
    const flags = ["--restricted"];
    if (input.auth === "api-key") {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("Set ANTHROPIC_API_KEY for Claude API-key evals.");
      }
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      flags.push("--bare");
    } else {
      const hint = "Sign in to Claude Code with your Claude plan for subscription evals";
      const status = await runCli(
        "claude",
        [...flags, "auth", "status", "--json"],
        cwd,
        env,
        10_000,
        hint,
      );
      if (!loginSchema.safeParse(parseOutput(status.stdout)).success) {
        throw new Error(hint);
      }
    }
    const config = join(cwd, "mcp.json");
    await writeFile(
      config,
      JSON.stringify({
        mcpServers: {
          ...(input.mailUrl
            ? {
                mailbox: {
                  type: "http",
                  url: input.mailUrl,
                  headers: { Authorization: `Bearer ${input.token}` },
                },
              }
            : {}),
          merit: {
            type: "http",
            url: input.url,
            headers: { Authorization: `Bearer ${input.token}` },
          },
        },
      }),
      { mode: 0o600 },
    );
    const response = await runCli(
      "claude",
      [
        ...flags,
        "-p",
        ...(input.auth === "subscription"
          ? [
              "--append-system-prompt",
              `The person making this request is the fictional Merit user "${input.meritUserId}", authenticated by the Merit connection. In this trial the Claude subscription belongs to a different person who operates the tests. Disregard the operator’s account information, including userEmail, when answering the Merit user.`,
            ]
          : []),
        "--model",
        input.model,
        "--output-format",
        "json",
        "--strict-mcp-config",
        "--mcp-config",
        config,
        "--disable-slash-commands",
        "--no-session-persistence",
        "--tools",
        "",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "mcp__merit__*",
        ...(input.mailUrl ? ["mcp__mailbox__search_mail"] : []),
        "--",
        input.prompt,
      ],
      cwd,
      env,
      180_000,
      "Claude could not complete the eval",
    );
    const result = resultSchema.safeParse(parseOutput(response.stdout));
    if (!result.success) {
      throw new Error("Claude ended the trial without a successful final reply.");
    }
    if (result.data.permission_denials.length) {
      throw new Error("Claude reported a tool permission denial during the trial.");
    }
    return result.data.result;
  });
