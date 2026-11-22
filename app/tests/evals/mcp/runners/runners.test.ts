import { readFile, writeFile } from "node:fs/promises";

import { afterEach, expect, it, vi } from "vite-plus/test";

import { runClaude } from "./claude";
import { runCodex } from "./codex";
import { runCli, type TrialInput } from "./process";

vi.mock(import("./process"), async (original) => ({
  ...(await original()),
  runCli: vi.fn(),
}));

const command = vi.mocked(runCli);
const trial = {
  auth: "subscription",
  model: "test-model",
  meritUserId: "trial-reviewer",
  url: "http://127.0.0.1:34567/mcp/workspace",
  token: "fixture-bearer",
  prompt: "Which reviews are waiting for me?",
} satisfies TrialInput & { meritUserId: string };

const success = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  permission_denials: [],
  result: "Trial reply",
});

const stubCli = (
  codexStatus = "Logged in using ChatGPT",
  claudeMethod = "claude.ai",
  mailUrl?: string,
) =>
  command.mockImplementation(async (binary, args) => {
    if (args.includes("status")) {
      const status =
        binary === "codex"
          ? codexStatus
          : JSON.stringify({ loggedIn: true, authMethod: claudeMethod });
      return { stdout: status, stderr: "" };
    }
    if (binary === "codex") {
      const output = args[args.indexOf("--output-last-message") + 1];
      if (!output) {
        throw new Error("Missing output path");
      }
      await writeFile(output, "Trial reply");
    } else {
      const config = args[args.indexOf("--mcp-config") + 1];
      if (!config) {
        throw new Error("Missing MCP config");
      }
      expect(JSON.parse(await readFile(config, "utf8"))).toEqual({
        mcpServers: {
          ...(mailUrl
            ? {
                mailbox: {
                  type: "http",
                  url: mailUrl,
                  headers: { Authorization: `Bearer ${trial.token}` },
                },
              }
            : {}),
          merit: {
            type: "http",
            url: trial.url,
            headers: { Authorization: `Bearer ${trial.token}` },
          },
        },
      });
    }
    return { stdout: success, stderr: "" };
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it.for(["codex", "claude"] as const)(
  "keeps ambient API credentials out of %s subscription trials",
  async (client) => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic");
    stubCli();
    const run = client === "codex" ? runCodex : runClaude;
    expect(await run(trial)).toBe("Trial reply");
    expect(command).toHaveBeenCalledTimes(2);
    const invocation = command.mock.calls.at(-1);
    expect(invocation?.[1]).toContain(trial.prompt);
    expect(invocation?.[3]).not.toHaveProperty("CODEX_API_KEY");
    expect(invocation?.[3]).not.toHaveProperty("ANTHROPIC_API_KEY");
  },
);

it.for(["codex", "claude"] as const)(
  "uses an explicit API credential for %s key trials",
  async (client) => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic");
    stubCli();
    const run = client === "codex" ? runCodex : runClaude;
    expect(await run({ ...trial, auth: "api-key" })).toBe("Trial reply");
    expect(command).toHaveBeenCalledTimes(1);
    const invocation = command.mock.calls[0];
    expect(invocation?.[1].join(" ")).not.toMatch(/fixture-(openai|anthropic|bearer)/u);
    if (client === "codex") {
      expect(invocation?.[3].CODEX_API_KEY).toBe("fixture-openai");
      expect(invocation?.[3].CODEX_HOME).toContain(invocation?.[2]);
    } else {
      expect(invocation?.[3].ANTHROPIC_API_KEY).toBe("fixture-anthropic");
      expect(invocation?.[1]).toContain("--bare");
      expect(invocation?.[1]).not.toContain("--append-system-prompt");
    }
  },
);

it("keeps the Claude login separate from the authenticated Merit trial user", async () => {
  vi.stubEnv("USER", "subscription-user");
  stubCli();
  await runClaude(trial);
  expect(command.mock.calls.map(([, , , env]) => env.USER)).toEqual([
    "subscription-user",
    "subscription-user",
  ]);
  const args = command.mock.calls.at(-1)?.[1] ?? [];
  expect(args).toContain("--append-system-prompt");
  expect(args[args.indexOf("--append-system-prompt") + 1]).toContain(trial.meritUserId);
  expect(args.at(-1)).toBe(trial.prompt);
});

it("accepts an existing Codex API-key login without changing it", async () => {
  vi.stubEnv("OPENAI_API_KEY", undefined);
  stubCli("Logged in using an API key - example");
  expect(await runCodex({ ...trial, auth: "api-key" })).toBe("Trial reply");
  expect(command.mock.calls.at(-1)?.[1]).toContain('forced_login_method="api"');
});

it("stops before model execution if subscription auth resolves to a key", async () => {
  stubCli("Logged in using an API key - example", "api_key_helper");
  await expect(runClaude(trial)).rejects.toThrow("Claude plan");
  await expect(runCodex(trial)).rejects.toThrow("ChatGPT");
  expect(command.mock.calls.every(([, args]) => args.includes("status"))).toBe(true);
});

it("stops before a live trial when no API-key credential is available", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", undefined);
  vi.stubEnv("OPENAI_API_KEY", undefined);
  stubCli();
  await expect(runClaude({ ...trial, auth: "api-key" })).rejects.toThrow("ANTHROPIC_API_KEY");
  await expect(runCodex({ ...trial, auth: "api-key" })).rejects.toThrow("OPENAI_API_KEY");
  expect(command).toHaveBeenCalledTimes(1);
});

it("reports a denied Claude tool call even when the client produced a final reply", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic");
  command.mockResolvedValue({
    stdout: JSON.stringify({ ...JSON.parse(success), permission_denials: [{}] }),
    stderr: "",
  });
  await expect(runClaude({ ...trial, auth: "api-key" })).rejects.toThrow("permission denial");
});

it("keeps malformed Claude output out of the trial error", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic");
  command.mockResolvedValue({ stdout: "fixture-sensitive-output", stderr: "" });
  await expect(runClaude({ ...trial, auth: "api-key" })).rejects.toThrow(
    new Error("Claude ended the trial without a successful final reply."),
  );
});

it.for(["codex", "claude"] as const)(
  "supplies the competing mailbox to %s for the email scenario",
  async (client) => {
    const mailUrl = new URL("/mail", trial.url).href;
    stubCli("Logged in using ChatGPT", "claude.ai", mailUrl);
    const run = client === "codex" ? runCodex : runClaude;
    await run({ ...trial, mailUrl });
    const args = command.mock.calls.at(-1)?.[1] ?? [];
    expect(args).toContain(
      client === "codex"
        ? `mcp_servers.mailbox.url=${JSON.stringify(mailUrl)}`
        : "mcp__mailbox__search_mail",
    );
    expect(args.join(" ")).not.toContain(trial.token);
  },
);
