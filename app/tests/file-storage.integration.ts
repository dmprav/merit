import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";

import { AwsClient } from "aws4fetch";
import { assert, expect, it, onTestFinished } from "vite-plus/test";

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

it("creates a private object that can be read through its reference and rejects overwrites", async () => {
  const objects = createFileObjects(local);
  const storage = createFileStorage(objects);
  const bytes = Uint8Array.of(0, 13, 255, 0, 128, 10);
  const saved = await storage.writeFile(bytes);
  const url = `${endpoint}/${bucket}/${saved.objectKey}`;
  onTestFinished(async () => {
    const client = new AwsClient({
      accessKeyId: local.FILE_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: local.FILE_STORAGE_SECRET_ACCESS_KEY,
      service: "s3",
      region: local.FILE_STORAGE_REGION,
    });
    expect((await client.fetch(url, { method: "DELETE" })).ok).toBe(true);
  });
  expect((await fetch(url)).status).toBe(403);
  const changed = Uint8Array.of(1);
  await expect(
    objects.put(saved.objectKey, changed, createHash("sha256").update(changed).digest("hex")),
  ).rejects.toThrow("412");
  expect(await storage.readFile(saved)).toEqual(bytes);
});

it("downloads the original representation and rejects forced HTTP compression", async () => {
  const bytes = Buffer.from("grant evidence ".repeat(120));
  await using proxy = createServer((request, response) => {
    const negotiateGzip = request.headers["accept-encoding"] !== "identity";
    const body = negotiateGzip ? gzipSync(bytes) : bytes;
    // The forced response labels raw bytes as gzip. Buffering it would trigger a decoding error.
    if (negotiateGzip || request.url?.endsWith("/forced")) {
      response.setHeader("Content-Encoding", "gzip");
    }
    response.setHeader("Content-Length", body.byteLength);
    response.end(body);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert(address && typeof address !== "string");
  const objects = createFileObjects({
    ...local,
    FILE_STORAGE_ENDPOINT: `http://127.0.0.1:${address.port}`,
  });
  expect(await objects.get("files/negotiated", bytes.byteLength)).toEqual(new Uint8Array(bytes));
  await expect(objects.get("files/forced", bytes.byteLength)).rejects.toThrow("content encoding");
});
