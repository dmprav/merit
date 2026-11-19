import { createHash, randomUUID } from "node:crypto";

import { AwsClient } from "aws4fetch";
import { assert, expect, onTestFinished } from "vite-plus/test";

import { actor, workspaceSlug, workspaceTest as it } from "@merit/organizations/testing/workspace";
import { writeWorkspace } from "@merit/organizations/transactions";
import { createFileStorage } from "@merit/storage";

import { createFileObjects } from "../src/server/file-objects.server";

const endpoint = "http://127.0.0.1:8333";
const bucket = "merit-files";
const local = {
  FILE_STORAGE_ENDPOINT: endpoint,
  FILE_STORAGE_BUCKET: bucket,
  FILE_STORAGE_REGION: "us-east-1",
  FILE_STORAGE_ACCESS_KEY_ID: "merit-local",
  FILE_STORAGE_SECRET_ACCESS_KEY: "merit-local-storage",
};

it("stores private binary content and returns its original metadata and bytes", async ({ db }) => {
  const objects = createFileObjects(local);
  const storage = createFileStorage(objects);
  const bytes = Uint8Array.of(0, 13, 255, 0, 128, 10);
  const originalFilename = "../evidence/Étude.bin";
  const mimeType = "application/octet-stream";
  const upload = {
    requestId: randomUUID(),
    originalFilename,
    mimeType,
    bytes: new Uint8Array(bytes),
  };
  const saved = await writeWorkspace(db, actor.userId, workspaceSlug, (tx) => {
    const pending = storage.writeFile(
      tx,
      { organizationId: "alder", uploadedBy: actor.userId },
      upload,
    );
    upload.bytes.fill(42);
    upload.originalFilename = "reused.bin";
    return pending;
  });
  assert(saved.status === "ok");
  const url = `${endpoint}/${bucket}/${saved.file.objectKey}`;
  onTestFinished(async () => {
    const client = new AwsClient({
      accessKeyId: local.FILE_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: local.FILE_STORAGE_SECRET_ACCESS_KEY,
      service: "s3",
      region: local.FILE_STORAGE_REGION,
    });
    expect((await client.fetch(url, { method: "DELETE" })).ok).toBe(true);
  });
  expect(saved.file).toMatchObject({
    organizationId: "alder",
    originalFilename,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    uploadedBy: "dana",
    objectKey: `files/${saved.file.id}`,
  });
  expect(saved.file.createdAt).toBeInstanceOf(Date);
  expect((await fetch(url)).status).toBe(403);
  const changed = Uint8Array.of(1);
  await expect(
    objects.put(saved.file.objectKey, changed, createHash("sha256").update(changed).digest("hex")),
  ).rejects.toThrow("412");
  expect(await storage.readFile(saved.file)).toEqual(bytes);
});
