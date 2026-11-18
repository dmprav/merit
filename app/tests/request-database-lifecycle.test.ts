import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import type { DatabaseRunner } from "@merit/db";

const { clients, connectGate, mockDrizzle, handlerFetch, handleMcpMock, mcpResourceMetadataMock } =
  vi.hoisted(() => {
    type ClientRecord = {
      connectionString: string;
      release: ReturnType<typeof vi.fn>;
    };

    const records: ClientRecord[] = [];
    const drizzleFn = vi.fn((client: unknown) => ({ client }));
    const fetchFn = vi.fn();
    const mcpFn = vi.fn();
    const metadataFn = vi.fn(() => new Response("metadata", { status: 200 }));
    // Holds new connections open until a test releases them.
    const gate: { current?: Promise<void> } = {};

    return {
      clients: records,
      connectGate: gate,
      mockDrizzle: drizzleFn,
      handlerFetch: fetchFn,
      handleMcpMock: mcpFn,
      mcpResourceMetadataMock: metadataFn,
    };
  });

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: handlerFetch },
  createServerEntry: <T>(entry: T) => entry,
}));

vi.mock("pg", () => {
  class FakePool {
    private connectionString: string;
    constructor(options: { connectionString: string }) {
      this.connectionString = options.connectionString;
    }
    on = vi.fn();
    async connect() {
      const client = {
        connectionString: this.connectionString,
        release: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      };
      clients.push(client);
      await connectGate.current;
      return client;
    }
  }

  return { Pool: FakePool };
});

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: mockDrizzle,
}));

vi.mock("@merit/mcp", () => ({
  mcpResourceMetadata: mcpResourceMetadataMock,
  handleWorkspaceMcp: vi.fn(),
}));

vi.mock("../src/server/mcp.server", () => ({
  handleMcp: handleMcpMock,
}));

vi.mock("../src/server/services.server", () => ({
  createApplicationServices: ({
    database,
  }: {
    database: <T>(operation: (db: unknown) => Promise<T>) => Promise<T>;
  }) => ({
    navigation: {},
    reviewer: {},
    organizations: {},
    grantmaking: {},
    contacts: {},
    readWorkspace: (_actor: unknown, _slug?: string) => database(async (db) => db),
  }),
}));

vi.mock("../src/server/demo.server", () => ({
  demoCookie: () => undefined,
  createDemoServices: (database: <T>(operation: (db: unknown) => Promise<T>) => Promise<T>) => ({
    read: () => database(async (db) => ({ status: "unavailable" as const, db })),
    start: vi.fn(),
  }),
}));

vi.mock("../src/server/email-delivery.server", () => ({
  createEmailSender: () => vi.fn(),
}));

import type { ApplicationRequestContext } from "../src/request-context";
import serverEntry from "../src/server";

beforeEach(() => {
  clients.length = 0;
  connectGate.current = undefined;
  mockDrizzle.mockClear();
  handlerFetch.mockReset();
  handleMcpMock.mockReset();
  mcpResourceMetadataMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

const fetchRequest = async (url: string) => serverEntry.fetch(new Request(url), {} as never);

it("checks out and releases a pooled client per database call without holding connections across external I/O", async () => {
  const seenDbs: unknown[] = [];

  handlerFetch.mockImplementation(
    async (_request: Request, options?: { context?: ApplicationRequestContext }) => {
      const ctx = options?.context;
      expect(ctx).toBeDefined();

      seenDbs.push(await ctx!.workspace.readWorkspace({ userId: "u1" }, "alder"));
      // The checkout is released immediately when the operation finishes, before external HTTP calls.
      expect(clients).toHaveLength(1);
      expect(clients[0]!.release).toHaveBeenCalledOnce();

      const [birchDb, demoRead] = await Promise.all([
        ctx!.workspace.readWorkspace({ userId: "u1" }, "birch"),
        ctx!.demo.read() as unknown as Promise<{ db: unknown }>,
      ]);
      seenDbs.push(birchDb, demoRead.db);
      expect(clients).toHaveLength(3);
      expect(clients[1]!.release).toHaveBeenCalledOnce();
      expect(clients[2]!.release).toHaveBeenCalledOnce();
      return new Response("ok", { status: 200 });
    },
  );

  const response = await fetchRequest("https://merit.example/app");

  expect(response.status).toBe(200);
  expect(clients).toHaveLength(3);
  expect(new Set(seenDbs).size).toBe(3);
  expect(clients.every((client) => client.release.mock.calls.length === 1)).toBe(true);
});

it("prevents web responses from being framed", async () => {
  handlerFetch.mockResolvedValueOnce(new Response("page", { status: 200 }));

  const response = await fetchRequest("https://merit.example/app");

  expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
});

it("waits for in-flight database calls and releases their pooled clients before reporting a web handler failure", async () => {
  let releaseConnection!: () => void;
  connectGate.current = new Promise<void>((resolve) => {
    releaseConnection = resolve;
  });
  handlerFetch.mockImplementation(
    async (_request: Request, options?: { context?: ApplicationRequestContext }) => {
      void options!.context!.workspace.readWorkspace({ userId: "u1" }, "alder");
      throw new Error("handler boom");
    },
  );
  let settled = false;
  const response = fetchRequest("https://merit.example/app").finally(() => {
    settled = true;
  });

  await vi.waitFor(() => expect(clients).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(settled).toBe(false);

  releaseConnection();

  await expect(response).rejects.toThrow("handler boom");
  expect(clients[0]!.release).toHaveBeenCalledOnce();
});

it.each([
  {
    outcome: "succeeds",
    respond: async () => new Response("mcp ok", { status: 200 }),
    settle: (response: Promise<Response>) =>
      expect(response).resolves.toHaveProperty("status", 200),
  },
  {
    outcome: "throws",
    respond: async () => {
      throw new Error("mcp boom");
    },
    settle: (response: Promise<Response>) => expect(response).rejects.toThrow("mcp boom"),
  },
])(
  "gives MCP the request database and releases its pooled client when MCP $outcome",
  async ({ respond, settle }) => {
    handleMcpMock.mockImplementationOnce(
      async (
        _request: Request,
        _config: unknown,
        dependencies: { database: <T>(op: (db: unknown) => Promise<T>) => Promise<T> },
      ) => {
        await dependencies.database(async (db) => db);
        return respond();
      },
    );

    await settle(fetchRequest("https://merit.example/mcp/workspace"));

    expect(handleMcpMock).toHaveBeenCalledOnce();
    expect(clients).toHaveLength(1);
    expect(clients[0]!.connectionString).toBe(
      process.env.DATABASE_URL ?? "postgres://merit_runtime:merit@127.0.0.1:55432/merit",
    );
    expect(clients[0]!.release).toHaveBeenCalledOnce();
  },
);

it("discards a checkout after an operation fails and serves the next operation", async () => {
  handleMcpMock.mockImplementationOnce(
    async (_request, _config, { database }: { database: DatabaseRunner }) => {
      await expect(
        database(async () => {
          throw new Error("query failed");
        }),
      ).rejects.toThrow("query failed");
      await database(async () => undefined);
      return new Response("recovered");
    },
  );
  await fetchRequest("https://merit.example/mcp/workspace");

  expect(clients[0]!.release).toHaveBeenCalledExactlyOnceWith(true);
  expect(clients[1]!.release).toHaveBeenCalledExactlyOnceWith(false);
});

it("does not open any pg.Client when early routes or non-database requests complete", async () => {
  const metadata = await fetchRequest(
    "https://merit.example/.well-known/oauth-protected-resource/mcp/workspace",
  );
  expect(metadata.status).toBe(200);

  const missingMcp = await fetchRequest("https://merit.example/mcp");
  expect(missingMcp.status).toBe(404);

  handlerFetch.mockResolvedValueOnce(new Response("static", { status: 200 }));
  const staticPage = await fetchRequest("https://merit.example/");
  expect(staticPage.status).toBe(200);

  expect(clients).toHaveLength(0);
});

it("isolates pg.Client instances across concurrent HTTP requests and does not hold clients across pauses", async () => {
  const requestDbs: Record<string, unknown> = {};
  let releaseFirst!: () => void;
  const firstHold = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  handlerFetch.mockImplementation(
    async (request: Request, options?: { context?: ApplicationRequestContext }) => {
      const slug = new URL(request.url).pathname.slice(1);
      requestDbs[slug] = await options!.context!.workspace.readWorkspace({ userId: "u1" }, slug);
      if (slug === "first") {
        await firstHold;
        requestDbs.firstAfterPause = await options!.context!.workspace.readWorkspace(
          { userId: "u1" },
          slug,
        );
      }
      return new Response(slug, { status: 200 });
    },
  );

  const firstPromise = fetchRequest("https://merit.example/first");
  const secondPromise = fetchRequest("https://merit.example/second");

  const secondResponse = await secondPromise;
  expect(secondResponse.status).toBe(200);
  // Both initial operations released their clients immediately instead of holding one open during firstHold.
  expect(clients).toHaveLength(2);
  expect(clients.filter((client) => client.release.mock.calls.length > 0)).toHaveLength(2);

  releaseFirst();
  const firstResponse = await firstPromise;
  expect(firstResponse.status).toBe(200);

  expect(clients).toHaveLength(3);
  expect(requestDbs.first).not.toBe(requestDbs.second);
  expect(requestDbs.firstAfterPause).not.toBe(requestDbs.first);
  expect(clients.every((client) => client.release.mock.calls.length === 1)).toBe(true);
});
