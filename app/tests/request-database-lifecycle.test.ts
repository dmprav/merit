import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { clients, mockDrizzle, handlerFetch, handleMcpMock, mcpResourceMetadataMock } = vi.hoisted(
  () => {
    type ClientRecord = {
      connectionString: string;
      connect: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };

    const records: ClientRecord[] = [];
    const drizzleFn = vi.fn((client: unknown) => ({ client }));
    const fetchFn = vi.fn();
    const mcpFn = vi.fn();
    const metadataFn = vi.fn(() => new Response("metadata", { status: 200 }));

    return {
      clients: records,
      mockDrizzle: drizzleFn,
      handlerFetch: fetchFn,
      handleMcpMock: mcpFn,
      mcpResourceMetadataMock: metadataFn,
    };
  },
);

vi.mock("cloudflare:workers", () => ({
  waitUntil: vi.fn(),
  env: {
    HYPERDRIVE: { connectionString: "postgres://merit:merit@hyperdrive.local/merit" },
    CLERK_PUBLISHABLE_KEY: "pk_test",
    CLERK_SECRET_KEY: "sk_test",
    CLERK_ISSUER: "https://issuer.example",
    APP_ORIGIN: "https://merit.example",
    MERIT_OPERATOR_USER_IDS: "",
    EMAIL_FROM: "no-reply@merit.example",
    RESEND_API_KEY: "",
    MAILPIT_URL: "",
    OTEL_SERVICE_NAME: "merit",
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
    OTEL_EXPORTER_OTLP_HEADERS: "",
    OTEL_TRACE_FILTER: "checkly",
  },
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: handlerFetch },
  createServerEntry: <T>(entry: T) => entry,
}));

vi.mock("pg", () => {
  class FakeClient {
    connectionString: string;
    connect = vi.fn(async () => undefined);
    end = vi.fn(async () => undefined);
    on = vi.fn(() => this);

    constructor(options: { connectionString: string }) {
      this.connectionString = options.connectionString;
      clients.push({
        connectionString: options.connectionString,
        connect: this.connect,
        end: this.end,
      });
    }
  }

  return { Client: FakeClient };
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
  mockDrizzle.mockClear();
  handlerFetch.mockReset();
  handleMcpMock.mockReset();
  mcpResourceMetadataMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

const fetchRequest = (url: string) => serverEntry.fetch(new Request(url), {} as never);

it("reuses one pg.Client across database calls in a web request and closes it after responding", async () => {
  const seenDbs: unknown[] = [];

  handlerFetch.mockImplementation(
    async (_request: Request, options?: { context?: ApplicationRequestContext }) => {
      const ctx = options?.context;
      expect(ctx).toBeDefined();

      seenDbs.push(await ctx!.workspace.readWorkspace({ userId: "u1" }, "alder"));
      seenDbs.push(await ctx!.workspace.readWorkspace({ userId: "u1" }, "birch"));
      const demoRead = (await ctx!.demo.read()) as unknown as { db: unknown };
      seenDbs.push(demoRead.db);
      return new Response("ok", { status: 200 });
    },
  );

  const response = await fetchRequest("https://merit.example/app");

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  expect(clients).toHaveLength(1);
  expect(clients[0]!.connect).toHaveBeenCalledOnce();
  expect(clients[0]!.end).toHaveBeenCalledOnce();
  expect(seenDbs[0]).toBe(seenDbs[1]);
  expect(seenDbs[1]).toBe(seenDbs[2]);
});

it("closes the request-scoped pg.Client in finally when the web handler throws", async () => {
  handlerFetch.mockImplementation(
    async (_request: Request, options?: { context?: ApplicationRequestContext }) => {
      await options!.context!.workspace.readWorkspace({ userId: "u1" }, "alder");
      throw new Error("handler boom");
    },
  );

  await expect(fetchRequest("https://merit.example/app")).rejects.toThrow("handler boom");

  expect(clients).toHaveLength(1);
  expect(clients[0]!.connect).toHaveBeenCalledOnce();
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("awaits handleMcp and closes the request-scoped pg.Client in finally on success and failure", async () => {
  handleMcpMock.mockImplementationOnce(
    async (
      _request: Request,
      _config: unknown,
      dependencies: { database: <T>(op: (db: unknown) => Promise<T>) => Promise<T> },
    ) => {
      const db1 = await dependencies.database(async (db) => db);
      const db2 = await dependencies.database(async (db) => db);
      expect(db1).toBe(db2);
      expect(clients[0]!.end).not.toHaveBeenCalled();
      return new Response("mcp ok", { status: 200 });
    },
  );

  const ok = await fetchRequest("https://merit.example/mcp/workspace");
  expect(ok.status).toBe(200);
  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  handleMcpMock.mockImplementationOnce(
    async (
      _request: Request,
      _config: unknown,
      dependencies: { database: <T>(op: (db: unknown) => Promise<T>) => Promise<T> },
    ) => {
      await dependencies.database(async (db) => db);
      throw new Error("mcp boom");
    },
  );

  await expect(fetchRequest("https://merit.example/mcp/workspace")).rejects.toThrow("mcp boom");
  expect(clients).toHaveLength(2);
  expect(clients[1]!.end).toHaveBeenCalledOnce();
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

it("isolates pg.Client instances across concurrent HTTP requests", async () => {
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
      }
      return new Response(slug, { status: 200 });
    },
  );

  const firstPromise = fetchRequest("https://merit.example/first");
  const secondPromise = fetchRequest("https://merit.example/second");

  const secondResponse = await secondPromise;
  expect(secondResponse.status).toBe(200);
  expect(clients.filter((client) => client.end.mock.calls.length > 0)).toHaveLength(1);

  releaseFirst();
  const firstResponse = await firstPromise;
  expect(firstResponse.status).toBe(200);

  expect(clients).toHaveLength(2);
  expect(requestDbs.first).not.toBe(requestDbs.second);
  expect(clients[0]!.end).toHaveBeenCalledOnce();
  expect(clients[1]!.end).toHaveBeenCalledOnce();
});
