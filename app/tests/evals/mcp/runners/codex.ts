import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { runCli, withTrialDirectory, type TrialInput } from "./process";

export const runCodex = (input: TrialInput) =>
  withTrialDirectory(async (cwd) => {
    const env: NodeJS.ProcessEnv = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      CODEX_HOME: process.env.CODEX_HOME,
      MERIT_TRIAL_TOKEN: input.token,
    };
    const apiKey = input.auth === "api-key" && process.env.OPENAI_API_KEY;
    if (apiKey) {
      // codex exec supports a per-process key. Keep its credential store out of the user's profile.
      env.CODEX_HOME = join(cwd, "codex");
      await mkdir(env.CODEX_HOME, { mode: 0o700 });
      env.CODEX_API_KEY = apiKey;
    } else {
      const loginHint =
        input.auth === "subscription"
          ? "Sign in to Codex with ChatGPT for subscription evals"
          : "Set OPENAI_API_KEY or use codex login --with-api-key for API-key evals";
      const login = await runCli("codex", ["login", "status"], cwd, env, 10_000, loginHint);
      const method =
        input.auth === "subscription" ? /Logged in using ChatGPT/i : /Logged in using an API key/i;
      if (!method.test(login.stdout + login.stderr)) {
        throw new Error(loginHint);
      }
    }
    const output = join(cwd, "reply.txt");
    await runCli(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--sandbox",
        "read-only",
        "--disable",
        "shell_tool",
        "--disable",
        "unified_exec",
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--enable",
        "skip_host_skill_discovery",
        "-c",
        `forced_login_method="${input.auth === "subscription" ? "chatgpt" : "api"}"`,
        "-c",
        'web_search="disabled"',
        "-c",
        `mcp_servers.merit.url=${JSON.stringify(input.url)}`,
        "-c",
        'mcp_servers.merit.bearer_token_env_var="MERIT_TRIAL_TOKEN"',
        "-c",
        "mcp_servers.merit.required=true",
        "-c",
        'mcp_servers.merit.default_tools_approval_mode="approve"',
        ...(input.mailUrl
          ? [
              "-c",
              `mcp_servers.mailbox.url=${JSON.stringify(input.mailUrl)}`,
              "-c",
              'mcp_servers.mailbox.bearer_token_env_var="MERIT_TRIAL_TOKEN"',
              "-c",
              "mcp_servers.mailbox.required=true",
              "-c",
              'mcp_servers.mailbox.default_tools_approval_mode="approve"',
            ]
          : []),
        "--model",
        input.model,
        "--output-last-message",
        output,
        "--",
        input.prompt,
      ],
      cwd,
      env,
      180_000,
      "Codex could not complete the eval",
      (stderr) => {
        if (stderr.includes("model is not supported when using Codex with a ChatGPT account")) {
          return `${input.model} is unavailable with ChatGPT login. Choose a model supported by your subscription.`;
        }
        if (stderr.includes("model_not_found")) {
          return `The provider could not find or grant access to ${input.model} with the selected login.`;
        }
        if (stderr.includes("required MCP servers failed to initialize: merit")) {
          return "Codex could not initialize the Merit MCP server.";
        }
        return undefined;
      },
    );
    const reply = (await readFile(output, "utf8")).trim();
    if (!reply) {
      throw new Error("Codex ended the trial without a final reply.");
    }
    return reply;
  });
