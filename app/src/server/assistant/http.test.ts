import { expect, it, vi } from "vite-plus/test";

import type { Identity } from "@merit/auth";

import { handleAssistantHttp } from "./http.server";

const origin = "https://merit.example";
const workspace = "alder";
const id = "01h000000000";

const send = (
  input: unknown,
  {
    headers = {},
    identity = { status: "authenticated", actor: { userId: "sam" } },
    method = "POST",
    slug = workspace,
  }: { headers?: Record<string, string>; identity?: Identity; method?: string; slug?: string } = {},
) => {
  const request = new Request(origin + "/api/assistant/" + slug, {
    method,
    headers: { "Content-Type": "application/json", origin, ...headers },
    body: method === "GET" ? undefined : JSON.stringify(input),
  });
  const dispatch = vi.fn(async () => new Response(null, { status: 204 }));
  return {
    dispatch,
    response: handleAssistantHttp(request, slug, origin, async () => identity, dispatch),
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
    const { response, dispatch } = send(input, { headers });
    expect((await response).status).toBe(status);
    expect(dispatch).not.toHaveBeenCalled();
  },
);

it("keeps signed-out responses private", async () => {
  const { response, dispatch } = send({ action: "list" }, { identity: { status: "signed_out" } });
  expect((await response).status).toBe(401);
  expect((await response).headers.get("cache-control")).toBe("private, no-store");
  expect(dispatch).not.toHaveBeenCalled();
});

it.each([
  [{ method: "GET" }, 405, "method_not_allowed"],
  [{ slug: "bad slug" }, 404, "not_found"],
  [{ identity: { status: "unavailable" } }, 503, "unavailable"],
] satisfies [Parameters<typeof send>[1], number, string][])(
  "rejects %j before dispatch",
  async (options, code, status) => {
    const { response, dispatch } = send({ action: "list" }, options);
    const rejected = await response;
    expect(rejected.status).toBe(code);
    expect(await rejected.json()).toEqual({ status });
    expect(dispatch).not.toHaveBeenCalled();
  },
);
