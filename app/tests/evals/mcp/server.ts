import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import { text } from "node:stream/consumers";

import { createMCPServer } from "@tanstack/ai-mcp/server";
import { assert } from "vite-plus/test";
import { z } from "zod";

import { handleWorkspaceMcp } from "@merit/mcp";

import type { createTransport } from "../../fixtures/transport-test";
import type { ObservedCall, Scenario } from "./scenario";

const rpc = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z
    .object({
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const rpcResponse = z.object({
  id: z.union([z.string(), z.number()]),
  result: z
    .object({
      isError: z.boolean().optional(),
      tools: z.array(z.unknown()).optional(),
      structuredContent: z.record(z.string(), z.unknown()).optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .optional(),
  error: z.object({ message: z.string() }).optional(),
});

const responseMessage = async (reply: Response, requestId: string | number) => {
  const body = await reply.clone().text();
  // Older clients negotiate event streams. Ignore keepalives and progress notifications.
  const payloads = reply.headers.get("content-type")?.startsWith("text/event-stream")
    ? body
        .replaceAll("\r\n", "\n")
        .split("\n\n")
        .map((event) =>
          event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
        )
        .filter(Boolean)
    : [body];
  return payloads
    .map((payload) => rpcResponse.safeParse(JSON.parse(payload)).data)
    .find((message) => message?.id === requestId);
};

const readOutcome = async (
  reply: Response,
  requestId: string | number,
): Promise<ObservedCall["outcome"]> => {
  if (!reply.ok) {
    return { kind: "error", message: `HTTP ${reply.status}` };
  }
  const message = await responseMessage(reply, requestId);
  if (!message) {
    return { kind: "error", message: "Missing MCP response for this call" };
  }
  const { error, result } = message;
  if (error || result?.isError) {
    return {
      kind: "error",
      message: error?.message ?? result?.content?.find((part) => part.type === "text")?.text,
      content: result?.structuredContent,
    };
  }
  assert(result?.structuredContent, "Trial tool returned no structured result");
  return { kind: "success", content: result.structuredContent };
};

export const serveTrial = async (
  operations: ReturnType<typeof createTransport>["mcpOperations"],
  userId: string,
  scopes: readonly string[],
  scenario?: Pick<Scenario, "beforeCall" | "externalMail">,
) => {
  const token = randomUUID();
  const trace: ObservedCall[] = [];
  let discovered = false;

  const respond = async (request: IncomingMessage): Promise<Response> => {
    let call: { id: string | number; observation: ObservedCall } | undefined;
    const mail = request.url === "/mail" ? scenario?.externalMail : undefined;
    if (!mail && request.url !== "/mcp/workspace") {
      return new Response(null, { status: 404 });
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      return new Response(null, { status: 401 });
    }
    const raw = request.method === "POST" ? await text(request) : undefined;
    const message = raw ? rpc.safeParse(JSON.parse(raw)).data : undefined;
    if (message?.method === "tools/call" && message.id !== undefined && message.params) {
      const observation: ObservedCall = {
        ...message.params,
        source: mail ? "mailbox" : "merit",
        outcome: { kind: "pending" },
      };
      call = { id: message.id, observation };
      trace.push(observation);
      await scenario?.beforeCall?.(message.params.name);
    }

    const headers = new Headers();
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      const name = request.rawHeaders[i];
      const value = request.rawHeaders[i + 1];
      if (name && value !== undefined) {
        headers.append(name, value);
      }
    }
    const incoming = new Request(mail ? mailUrl : url, {
      method: request.method,
      headers,
      body: raw,
    });
    const reply = mail
      ? await createMCPServer({
          name: "mailbox",
          version: "1",
          setup(server) {
            server.registerTool(
              "search_mail",
              {
                description:
                  "Search the signed-in user's email messages by sender, subject or keyword.",
                inputSchema: z.object({ query: z.string() }),
              },
              async () => ({
                content: [{ type: "text", text: JSON.stringify(mail) }],
                structuredContent: mail,
              }),
            );
          },
        }).handle(incoming)
      : await handleWorkspaceMcp(incoming, url, {
          ...operations,
          authenticate: async () => ({
            userId,
            provenance: { interface: "mcp", clientId: "merit-eval" },
            scopes,
          }),
        });
    if (call) {
      call.observation.outcome = await readOutcome(reply, call.id);
    } else if (
      !discovered &&
      !mail &&
      reply.ok &&
      message?.method === "tools/list" &&
      message.id !== undefined
    ) {
      discovered = (await responseMessage(reply, message.id))?.result?.tools !== undefined;
    }
    return reply;
  };

  const server = createServer((request, response) => {
    void (async () => {
      const reply = await respond(request);
      response.writeHead(reply.status, Object.fromEntries(reply.headers));
      if (reply.body) {
        await reply.body.pipeTo(
          new WritableStream({
            write(chunk) {
              response.write(chunk);
            },
          }),
        );
      }
      response.end();
    })().catch(() => response.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/mcp/workspace`;

  const mailUrl = new URL("/mail", url).href;

  const close = async () => {
    server.closeAllConnections();
    await server[Symbol.asyncDispose]();
  };

  return {
    trace,
    close,
    discovered: () => discovered,
    token,
    url,
    mailUrl: scenario?.externalMail ? mailUrl : undefined,
  };
};
