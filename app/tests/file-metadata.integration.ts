import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect, vi } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { seedExampleReviewer, seedExampleRounds } from "@merit/grantmaking/testing";
import { actor, workspaceSlug, workspaceTest } from "@merit/organizations/testing/workspace";
import {
  assignmentScope,
  readScoped,
  readWorkspace,
  writeScoped,
  writeWorkspace,
} from "@merit/organizations/transactions";
import { permittedReviewerWork } from "@merit/reviews/readers";
import { createFileStorage } from "@merit/storage";
import { workspaceFiles } from "@merit/storage/schema";

const context = { organizationId: workspaceSlug, uploadedBy: actor.userId };

const upload = () => ({
  requestId: randomUUID(),
  originalFilename: "Résumé.bin",
  mimeType: "application/octet-stream",
  bytes: Uint8Array.of(0, 255),
});

const it = workspaceTest
  .extend("runtime", { scope: "file" }, ({ database }) => database.createRuntimeConnection())
  .extend("files", ({ runtime }) => {
    const objects = {
      put: vi.fn(async (_key: string) => {}),
      get: vi.fn(async () => Uint8Array.of(0, 255)),
    };
    const storage = createFileStorage(objects);

    const write = (input: ReturnType<typeof upload>, userId = actor.userId) =>
      withDatabase(runtime, (db) =>
        writeWorkspace(db, userId, workspaceSlug, (tx) =>
          storage.writeFile(tx, { ...context, uploadedBy: userId }, input),
        ),
      );

    return { storage, write, objects };
  });

it("concurrent retries reuse one upload and reject a different payload or actor", async ({
  files,
  database,
}) => {
  const input = upload();
  const [one, two] = await Promise.all([files.write(input), files.write(input)]);
  assert(one.status === "ok");
  expect(two).toEqual(one);
  for (const changes of [
    { bytes: Uint8Array.of(255, 0) },
    { originalFilename: "another.bin" },
    { mimeType: "text/plain" },
  ]) {
    expect(await files.write({ ...input, ...changes })).toEqual({ status: "conflict" });
  }
  await database.client.query(
    "insert into memberships (organization_id, user_id, role) values ('alder', 'birch-manager', 'program_manager')",
  );
  expect(await files.write(input, "birch-manager")).toEqual({ status: "conflict" });
  expect(files.objects.put).toHaveBeenCalledTimes(1);
});

it("rolls back an interrupted upload and publishes a fresh object on retry", async ({
  files,
  database,
  runtime,
}) => {
  const input = upload();
  const failure = new Error("Upload interrupted");
  files.objects.put.mockImplementationOnce(async () => {
    expect((await database.client.query("select id from workspace_files")).rows).toEqual([]);
    throw failure;
  });
  await withDatabase(runtime, (db) =>
    writeWorkspace(db, actor.userId, workspaceSlug, async (tx) => {
      await expect(files.storage.writeFile(tx, context, input)).rejects.toBe(failure);
      // The owner handles the storage error and commits its remaining work.
    }),
  );
  expect((await database.client.query("select id from workspace_files")).rows).toEqual([]);
  const saved = await files.write(input);
  assert(saved.status === "ok");
  expect(files.objects.put.mock.calls[0]?.[0]).not.toBe(saved.file.objectKey);
});

it("rolls back the metadata when its owner cannot commit the attachment", async ({
  files,
  runtime,
  database,
}) => {
  const input = upload();
  const failure = new Error("Attachment rejected");
  await expect(
    withDatabase(runtime, (db) =>
      writeWorkspace(db, actor.userId, workspaceSlug, async (tx) => {
        const saved = await files.storage.writeFile(tx, context, input);
        assert(saved.status === "ok");
        throw failure;
      }),
    ),
  ).rejects.toBe(failure);
  expect((await database.client.query("select id from workspace_files")).rows).toEqual([]);
  expect((await files.write(input)).status).toBe("ok");
  expect(files.objects.put).toHaveBeenCalledTimes(2);
});

it("preserves tenant isolation, uploader attribution and immutable metadata", async ({
  files,
  runtime,
  database,
}) => {
  await database.client.query(
    "insert into memberships (organization_id, user_id, role) values ('birch', 'dana', 'program_manager')",
  );
  const saved = await files.write(upload());
  assert(saved.status === "ok");
  await withDatabase(runtime, async (db) => {
    expect(await db.select().from(workspaceFiles)).toEqual([]);
    expect(
      await readWorkspace(db, actor.userId, "birch", (tx) => tx.select().from(workspaceFiles)),
    ).toEqual([]);
    for (const invalid of [
      { ...context, organizationId: "birch" },
      { ...context, uploadedBy: "birch-manager" },
    ]) {
      await expect(
        writeWorkspace(db, actor.userId, workspaceSlug, (tx) =>
          files.storage.writeFile(tx, invalid, upload()),
        ),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    }
    await expect(
      db.execute(sql`update workspace_files set mime_type = 'text/plain'`),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(db.execute(sql`delete from workspace_files`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });
});

it("replays a committed receipt after a lost acknowledgement", async ({ files }) => {
  const input = upload();
  const lostReply = files.write(input).then(() => {
    throw new Error("Commit acknowledgement lost");
  });
  await expect(lostReply).rejects.toThrow("Commit acknowledgement lost");
  const retry = await files.write(input);
  assert(retry.status === "ok");
  expect(files.objects.put).toHaveBeenCalledTimes(1);
  expect(await files.storage.readFile(retry.file)).toEqual(input.bytes);
});

it("withholds bytes that differ from their authoritative metadata", async ({ files }) => {
  const saved = await files.write(upload());
  assert(saved.status === "ok");
  files.objects.get.mockResolvedValueOnce(Uint8Array.of(42, 42));
  await expect(files.storage.readFile(saved.file)).rejects.toThrow(
    "Stored file content does not match its metadata.",
  );
});

it("lets Reviews authorize an assigned reviewer and withhold the same file from another workspace member", async ({
  files,
  db,
  database,
  runtime,
}) => {
  await seedExampleRounds(db);
  await seedExampleReviewer(db);
  const reviewer = "local-reviewer";
  const { rows } = await database.client.query<{ id: string }>(
    "update review_assignments set status = 'accepted', accepted_at = now(), reviewer_user_id = $1 where email = 'reviewer@example.test' returning id",
    [reviewer],
  );
  const assignmentId = rows[0]?.id;
  assert(assignmentId);

  // A test-only owner records which stored file belongs to an assignment.
  await db.execute(sql`create table attachments (
    assignment_id uuid primary key references review_assignments(id),
    organization_id text not null, file_id uuid not null,
    foreign key (organization_id, file_id) references workspace_files(organization_id, id))`);
  await db.execute(
    sql`grant select, insert on attachments to ${sql.identifier(new URL(runtime).username)}`,
  );
  const file = await withDatabase(runtime, async (connection) => {
    const scope = assignmentScope(reviewer, assignmentId);
    await writeScoped(connection, scope, async (tx) => {
      assert(await permittedReviewerWork(tx, assignmentId, reviewer));
      const saved = await files.storage.writeFile(
        tx,
        { ...context, uploadedBy: reviewer },
        upload(),
      );
      assert(saved.status === "ok");
      await tx.execute(
        sql`insert into attachments values (${assignmentId}, ${context.organizationId}, ${saved.file.id})`,
      );
    });

    const resolve = (userId: string) =>
      readScoped(connection, assignmentScope(userId, assignmentId), async (tx) => {
        if (!(await permittedReviewerWork(tx, assignmentId, userId))) {
          return undefined;
        }
        const [row] = await tx
          .select({ file: workspaceFiles })
          .from(workspaceFiles)
          .innerJoin(
            sql`attachments`,
            sql`attachments.file_id = ${workspaceFiles.id}
            and attachments.organization_id = ${workspaceFiles.organizationId}`,
          )
          .where(sql`attachments.assignment_id = ${assignmentId}`);
        return row?.file;
      });

    expect(await resolve(actor.userId)).toBeUndefined();
    expect(files.objects.get).not.toHaveBeenCalled();
    return resolve(reviewer);
  });
  assert(file);
  expect(await files.storage.readFile(file)).toEqual(Uint8Array.of(0, 255));
});
