import { expect, it, vi } from "vite-plus/test";

import type { Identity } from "@merit/auth";

import { handleAssistantHttp } from "./http.server";
import { watchAssistant } from "./watch.server";

const origin = "https://merit.example";
const workspace = "alder";
const id = "01h000000000";

const send = (
  input: unknown,
  headers: Record<string, string> = {},
  identity: Identity = {
    status: "authenticated",
    actor: { userId: "sam" },
  },
) => {
  const request = new Request(origin + "/api/assistant/alder", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, ...headers },
    body: JSON.stringify(input),
  });
  const dispatch = vi.fn(async () => new Response(null, { status: 204 }));
  return {
    dispatch,
    response: handleAssistantHttp(request, workspace, origin, async () => identity, dispatch),
  };
};

it("binds the verified user and route workspace before handing a turn to the backend", async () => {
  const input = { action: "start", id, message: "Compare requests", page: "/app/alder/rounds" };
  const { response, dispatch } = send(input);
  expect((await response).status).toBe(204);
  expect(dispatch).toHaveBeenCalledWith({ userId: "sam" }, workspace, input, expect.anything());
});

it.each([
  [{ action: "list" }, { origin: "https://another.example" }, 403],
  [{ action: "list" }, { "Content-Type": "text/plain" }, 415],
  [{ action: "list", actor: { userId: "other" } }, {}, 400],
  [{ action: "approve", id, previewId: "p", toolArguments: {} }, {}, 400],
  [{ action: "start", id, message: "Read", page: "/app/alder/../birch" }, {}, 400],
  [{ action: "start", id, message: "Read", page: "/app/alderly" }, {}, 400],
  [{ action: "start", id, message: "x".repeat(100000) }, {}, 400],
] satisfies [unknown, Record<string, string>, number][])(
  "rejects unauthorized or malformed requests",
  async (input, headers, status) => {
    const { response, dispatch } = send(input, headers);
    expect((await response).status).toBe(status);
    expect(dispatch).not.toHaveBeenCalled();
  },
);

it("keeps signed-out responses private", async () => {
  const { response, dispatch } = send({ action: "list" }, {}, { status: "signed_out" });
  expect((await response).status).toBe(401);
  expect((await response).headers.get("cache-control")).toBe("private, no-store");
  expect(dispatch).not.toHaveBeenCalled();
});

it("publishes an already settled conversation once and closes the stream", async () => {
  const open = vi.fn(async () => ({ revision: 3, status: "awaiting_approval", id }));
  const result = await watchAssistant(open, new AbortController().signal);
  expect(result.headers.get("Content-Type")).toBe("text/event-stream");
  expect(await result.text()).toContain(
    `event: conversation\ndata: {"revision":3,"status":"awaiting_approval","id":"${id}"}\n\n`,
  );
  expect(open).toHaveBeenCalledTimes(1);
});
