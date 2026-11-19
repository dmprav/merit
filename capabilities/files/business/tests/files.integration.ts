import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect, vi } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { actor, workspaceSlug, workspaceTest } from "@merit/organizations/testing/workspace";
import { readWorkspace } from "@merit/organizations/transactions";

import { createFileService } from "../src/server";

const it = workspaceTest
  .extend("runtime", { scope: "file" }, ({ database }) => database.createRuntimeConnection())
  .extend("files", async ({ runtime }) => {
    const objects = {
      put: vi.fn(async (_key: string) => {}),
      get: vi.fn(async () => Uint8Array.of(0, 255)),
    };
    return { service: createFileService((run) => withDatabase(runtime, run), objects), objects };
  });

const upload = () => ({
  workspaceSlug,
  requestId: randomUUID(),
  originalFilename: "Résumé.bin",
  mimeType: "application/octet-stream",
  bytes: Uint8Array.of(0, 255),
});

it("concurrent retries publish one immutable object and reject different input", async ({
  files,
  database,
}) => {
  const input = upload();
  const [one, two] = await Promise.all([
    files.service.writeFile(actor, input),
    files.service.writeFile(actor, input),
  ]);
  assert(one.status === "ok");
  expect(two).toEqual(one);
  for (const changes of [
    { bytes: Uint8Array.of(255, 0) },
    { originalFilename: "another.bin" },
    { mimeType: "text/plain" },
  ]) {
    expect(await files.service.writeFile(actor, { ...input, ...changes })).toEqual({
      status: "conflict",
    });
  }
  await database.client.query(
    "insert into memberships (organization_id, user_id, role) values ('alder', 'birch-manager', 'program_manager')",
  );
  expect(await files.service.writeFile({ userId: "birch-manager" }, input)).toEqual({
    status: "conflict",
  });
  expect(files.objects.put).toHaveBeenCalledTimes(1);
});

it("uncommitted metadata stays invisible and a failed upload can be retried", async ({
  files,
  database,
}) => {
  const input = upload();
  const failure = new Error("Object upload response lost");
  files.objects.put.mockImplementationOnce(async () => {
    expect((await database.client.query("select id from workspace_files")).rows).toEqual([]);
    throw failure;
  });
  await expect(files.service.writeFile(actor, input)).rejects.toBe(failure);
  expect((await database.client.query("select id from workspace_files")).rows).toEqual([]);
  const saved = await files.service.writeFile(actor, input);
  assert(saved.status === "ok");
  expect(files.objects.put.mock.calls[0]?.[0]).not.toBe(saved.file.objectKey);
  expect(files.objects.put).toHaveBeenCalledTimes(2);
});

it("reads and writes require current grant work authority before contacting storage", async ({
  files,
  database,
}) => {
  const input = upload();
  const saved = await files.service.writeFile(actor, input);
  assert(saved.status === "ok");
  const address = { workspaceSlug, fileId: saved.file.id };
  await database.client.query(
    "update memberships set role = 'reviewer', administration = 'owner' where user_id = 'dana'",
  );
  expect(await files.service.readFile(actor, address)).toEqual({ status: "not_found" });
  expect(await files.service.writeFile(actor, input)).toEqual({ status: "not_found" });
  expect(files.objects.get).not.toHaveBeenCalled();
  expect(files.objects.put).toHaveBeenCalledTimes(1);
});

it("isolates a manager's two workspaces in both the service and restricted PostgreSQL", async ({
  files,
  runtime,
  database,
}) => {
  await database.client.query(
    "insert into memberships (organization_id, user_id, role) values ('birch', 'dana', 'program_manager')",
  );
  const saved = await files.service.writeFile(actor, upload());
  assert(saved.status === "ok");
  expect(
    await files.service.readFile(actor, { workspaceSlug: "birch", fileId: saved.file.id }),
  ).toEqual({ status: "not_found" });
  expect(files.objects.get).not.toHaveBeenCalled();
  await withDatabase(runtime, async (db) => {
    const visible = sql`select id from workspace_files`;
    expect((await db.execute(visible)).rows).toEqual([]);
    expect(
      (await readWorkspace(db, actor.userId, "birch", (tx) => tx.execute(visible))).rows,
    ).toEqual([]);
    expect(
      (await readWorkspace(db, actor.userId, workspaceSlug, (tx) => tx.execute(visible))).rows,
    ).toEqual([{ id: saved.file.id }]);
    await expect(
      db.execute(sql`update workspace_files set mime_type = 'text/plain'`),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(db.execute(sql`delete from workspace_files`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });
});

it("a lost commit acknowledgement is recoverable without another object upload", async ({
  files,
  runtime,
}) => {
  const input = upload();
  const failure = new Error("Commit acknowledgement lost");
  const connection = createFileService(async (run) => {
    await withDatabase(runtime, run);
    throw failure;
  }, files.objects);

  await expect(connection.writeFile(actor, input)).rejects.toBe(failure);
  const retry = await files.service.writeFile(actor, input);
  assert(retry.status === "ok");
  expect(files.objects.put).toHaveBeenCalledTimes(1);
  expect(
    await files.service.readFile(actor, { workspaceSlug, fileId: retry.file.id }),
  ).toMatchObject({
    status: "ok",
    bytes: input.bytes,
  });
});

it("withholds bytes that differ from their authoritative metadata", async ({ files }) => {
  const saved = await files.service.writeFile(actor, upload());
  assert(saved.status === "ok");
  files.objects.get.mockResolvedValueOnce(Uint8Array.of(42, 42));
  await expect(
    files.service.readFile(actor, { workspaceSlug, fileId: saved.file.id }),
  ).rejects.toThrow("Stored file content does not match its metadata.");
});
