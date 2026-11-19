import { createHash } from "node:crypto";

import { expect, it, vi } from "vite-plus/test";

import { createFileStorage } from "./storage.server";

const setup = () => {
  const saved = new Map<string, { bytes: Uint8Array<ArrayBuffer>; sha256: string }>();
  const objects = {
    put: vi.fn(async (key: string, bytes: Uint8Array<ArrayBuffer>, sha256: string) => {
      saved.set(key, { bytes, sha256 });
    }),
    get: vi.fn(async (key: string) => {
      const object = saved.get(key);
      if (!object) {
        throw new Error(`Missing object: ${key}`);
      }
      return object.bytes;
    }),
  };
  return { storage: createFileStorage(objects), objects, saved };
};

it("returns the key, length and digest of the original bytes", async () => {
  const { storage, saved } = setup();
  const bytes = Uint8Array.of(0, 255);
  const writing = storage.writeFile(bytes);
  bytes.fill(42);
  const reference = await writing;
  const original = Uint8Array.of(0, 255);
  const sha256 = createHash("sha256").update(original).digest("hex");
  expect(reference.objectKey).toMatch(/^files\//u);
  expect(reference).toEqual({
    objectKey: reference.objectKey,
    byteLength: 2,
    sha256,
  });
  expect(saved.get(reference.objectKey)).toEqual({ bytes: original, sha256 });
  expect(await storage.readFile(reference)).toEqual(original);
});

it("creates distinct objects for independent writes of the same empty file", async () => {
  const { storage } = setup();
  const first = await storage.writeFile(new Uint8Array());
  const second = await storage.writeFile(new Uint8Array());
  expect(second.objectKey).not.toBe(first.objectKey);
  expect(await storage.readFile(first)).toEqual(new Uint8Array());
  expect(await storage.readFile(second)).toEqual(new Uint8Array());
});

it("limits buffered writes to 25 MiB", async () => {
  const { storage, saved } = setup();
  const limit = 25 * 1024 * 1024;
  const reference = await storage.writeFile(new Uint8Array(limit));
  expect(reference.byteLength).toBe(limit);
  await expect(storage.writeFile(new Uint8Array(limit + 1))).rejects.toThrow("25 MiB");
  expect([...saved.keys()]).toEqual([reference.objectKey]);
});

it("propagates an upload failure to the attachment owner", async () => {
  const { storage, objects } = setup();
  const failure = new Error("Object store unavailable");
  objects.put.mockRejectedValueOnce(failure);
  await expect(storage.writeFile(new Uint8Array())).rejects.toBe(failure);
});

it("validates a persisted reference before fetching bytes", async () => {
  const { storage, objects } = setup();
  const reference = await storage.writeFile(new Uint8Array());
  for (const invalid of [
    { objectKey: "../another-bucket/key" },
    { byteLength: -1 },
    { sha256: "invalid" },
  ]) {
    await expect(storage.readFile({ ...reference, ...invalid })).rejects.toThrow();
  }
  expect(objects.get).not.toHaveBeenCalled();
});

it("rejects truncated or corrupted content", async () => {
  const { storage, objects } = setup();
  const reference = await storage.writeFile(Uint8Array.of(255));
  for (const bytes of [new Uint8Array(), Uint8Array.of(0)]) {
    objects.get.mockResolvedValueOnce(bytes);
    await expect(storage.readFile(reference)).rejects.toThrow("does not match");
  }
});
