import { createHash, randomUUID } from "node:crypto";

import { AwsClient } from "aws4fetch";
import { assert, expect, onTestFinished } from "vite-plus/test";

import { createFileService } from "@merit/files/server";
import { actor, workspaceSlug, workspaceTest as it } from "@merit/organizations/testing/workspace";

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
  const files = createFileService((run) => run(db), objects);
  const bytes = Uint8Array.of(0, 13, 255, 0, 128, 10);
  const originalFilename = "../evidence/Étude.bin";
  const mimeType = "application/octet-stream";
  const saved = await files.writeFile(actor, {
    workspaceSlug,
    requestId: randomUUID(),
    originalFilename,
    mimeType,
    bytes,
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
    uploadedBy: "dana",
    objectKey: `files/${saved.file.id}`,
  });
  expect(saved.file.createdAt).toBeInstanceOf(Date);
  expect((await fetch(url)).status).toBe(403);
  const changed = Uint8Array.of(1);
  await expect(
    objects.put(saved.file.objectKey, changed, createHash("sha256").update(changed).digest("hex")),
  ).rejects.toThrow("412");
  expect(await files.readFile(actor, { workspaceSlug, fileId: saved.file.id })).toEqual({
    status: "ok",
    file: saved.file,
    bytes,
  });
});
