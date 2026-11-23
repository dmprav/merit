import { z } from "zod";

import type { Actor, Identity } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

const id = publicIdSchema;
const token = z.string().min(1).max(200);
const command = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("settings") }),
  z.strictObject({ action: z.literal("set_consent"), enabled: z.boolean() }),
  z.strictObject({ action: z.literal("create") }),
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("open"), id }),
  z.strictObject({
    action: z.literal("evidence"),
    id,
    key: z.string().regex(/^E[1-9][0-9]{0,9}$/),
  }),
  z.strictObject({ action: z.literal("watch"), id }),
  z.strictObject({ action: z.literal("delete"), id }),
  z.strictObject({ action: z.literal("stop"), id }),
  z.strictObject({
    action: z.literal("start"),
    id,
    message: z.string().trim().min(1).max(16000),
    page: z.string().max(1024).optional(),
  }),
  z.strictObject({ action: z.literal("approve"), id, previewId: token }),
  z.strictObject({ action: z.literal("decline"), id, previewId: token }),
  z.strictObject({ action: z.literal("retry"), id, previewId: token, actionId: token }),
]);

export type AssistantCommand = z.infer<typeof command>;

const privateHeaders = { "Cache-Control": "private, no-store" };

export const assistantJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: privateHeaders });

// Enforce the byte limit while reading, including requests without Content-Length.
const readCommand = async (request: Request) => {
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let json = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > 96 * 1024) {
        await reader.cancel();
        return null;
      }
      json += decoder.decode(value, { stream: true });
    }
    return command.parse(JSON.parse(json + decoder.decode()));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
};

export const handleAssistantHttp = async (
  request: Request,
  workspace: string,
  origin: string,
  currentIdentity: () => Promise<Identity>,
  dispatch: (
    actor: Actor,
    workspace: string,
    command: AssistantCommand,
    signal: AbortSignal,
  ) => Promise<Response>,
) => {
  if (request.method !== "POST") {
    return assistantJson({ status: "method_not_allowed" }, 405);
  }
  if (request.headers.get("origin") !== origin) {
    return assistantJson({ status: "forbidden" }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return assistantJson({ status: "unsupported_media_type" }, 415);
  }
  if (!workspaceSlugSchema.safeParse(workspace).success) {
    return assistantJson({ status: "not_found" }, 404);
  }
  const identity = await currentIdentity();
  if (identity.status !== "authenticated") {
    return assistantJson({ status: identity.status }, identity.status === "signed_out" ? 401 : 503);
  }
  const input = await readCommand(request);
  if (!input) {
    return assistantJson({ status: "invalid_input" }, 400);
  }
  if (input.action === "start" && input.page !== undefined) {
    const path = URL.parse(input.page, origin);
    const root = `/app/${workspace}`;
    if (
      !path ||
      path.origin !== origin ||
      path.pathname !== input.page ||
      !(path.pathname === root || path.pathname.startsWith(root + "/"))
    ) {
      return assistantJson({ status: "invalid_page" }, 400);
    }
  }
  return dispatch(identity.actor, workspace, input, request.signal);
};
