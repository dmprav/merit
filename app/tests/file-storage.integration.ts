import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";

import { AwsClient } from "aws4fetch";
import { assert, expect, it, onTestFinished, vi } from "vite-plus/test";

import { createFileStorage } from "@merit/storage";

import { createFileObjects } from "../src/server/file-objects.server";
import { localFileStorage as local, deleteLocalTestFile } from "./local-file-storage";

const endpoint = local.FILE_STORAGE_ENDPOINT;
const bucket = local.FILE_STORAGE_BUCKET;

it("creates a private object that can be read through its reference and rejects overwrites", async () => {
  const objects = createFileObjects(local);
  const storage = createFileStorage(objects);
  const bytes = Uint8Array.of(0, 13, 255, 0, 128, 10);
  const saved = await storage.writeFile(bytes);
  const url = `${endpoint}/${bucket}/${saved.objectKey}`;
  onTestFinished(async () => {
    expect(await deleteLocalTestFile(saved.objectKey)).toBe(true);
  });
  expect((await fetch(url)).status).toBe(403);
  const changed = Uint8Array.of(1);
  await expect(
    objects.put(saved.objectKey, changed, createHash("sha256").update(changed).digest("hex")),
  ).rejects.toThrow("412");
  expect(await storage.readFile(saved)).toEqual(bytes);
});

it("downloads the original representation and rejects forced HTTP compression", async () => {
  const key = `files/${randomUUID()}`;
  const forcedKey = `files/${randomUUID()}`;
  const bytes = Buffer.from("grant evidence ".repeat(120));
  await using proxy = createServer((request, response) => {
    const negotiateGzip = request.headers["accept-encoding"] !== "identity";
    const body = negotiateGzip ? gzipSync(bytes) : bytes;
    // The forced response labels raw bytes as gzip. Buffering it would trigger a decoding error.
    if (negotiateGzip || request.url?.endsWith(forcedKey)) {
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
  expect(await objects.get(key, bytes.byteLength)).toEqual(new Uint8Array(bytes));
  await expect(objects.get(forcedKey, bytes.byteLength)).rejects.toThrow("content encoding");
});

it("rejects an invalid key before uploading to storage", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch").mockResolvedValue(new Response());
  const objects = createFileObjects(local);
  const bytes = new Uint8Array();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await expect(objects.put("files/invalid", bytes, sha256)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects an invalid key before downloading from storage", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch").mockResolvedValue(new Response());
  const objects = createFileObjects(local);
  await expect(objects.get("files/invalid", 0)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects an oversized read length before downloading from storage", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch").mockResolvedValue(new Response());
  const objects = createFileObjects(local);
  await expect(objects.get(`files/${randomUUID()}`, 25 * 1024 * 1024 + 1)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects a bucket containing adjacent periods before requesting storage", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch").mockResolvedValue(new Response());
  const objects = createFileObjects({ ...local, FILE_STORAGE_BUCKET: "merit..files" });
  await expect(objects.get(`files/${randomUUID()}`, 0)).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
});

it("uploads opaque bytes with an explicit binary content type", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch").mockResolvedValue(new Response());
  await createFileStorage(createFileObjects(local)).writeFile(Uint8Array.of(1));
  const init = fetch.mock.calls[0]?.[1];
  expect(new Headers(init?.headers).get("content-type")).toBe("application/octet-stream");
});

it("cancels an oversized stream as soon as its bytes exceed the reference", async () => {
  const cancel = vi.fn();
  let chunks = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        chunks += 1;
        if (chunks <= 2) {
          controller.enqueue(Uint8Array.of(chunks));
        } else {
          controller.close();
        }
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  using fetch = vi.spyOn(AwsClient.prototype, "fetch");
  fetch.mockResolvedValue(new Response(stream, { headers: { "Content-Length": "1" } }));
  await expect(createFileObjects(local).get(`files/${randomUUID()}`, 1)).rejects.toThrow("length");
  expect(cancel).toHaveBeenCalledOnce();
  expect(chunks).toBe(2);
});

it("rejects an early end of stream even when the length header matches", async () => {
  using fetch = vi.spyOn(AwsClient.prototype, "fetch");
  fetch.mockResolvedValue(new Response(Uint8Array.of(1), { headers: { "Content-Length": "2" } }));
  await expect(createFileObjects(local).get(`files/${randomUUID()}`, 2)).rejects.toThrow("length");
});
