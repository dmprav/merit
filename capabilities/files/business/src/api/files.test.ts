import { expect, it } from "vite-plus/test";

import { readFileInput, writeFileInput } from "./files";

const input = {
  workspaceSlug: "alder",
  requestId: crypto.randomUUID(),
  originalFilename: "Research 🗂.bin",
  mimeType: "application/octet-stream",
  bytes: new Uint8Array(),
};

it("accepts empty binary files and preserves the supplied filename", () => {
  expect(writeFileInput.parse(input)).toEqual(input);
});

it("rejects caller-supplied storage keys and attributed metadata", () => {
  for (const field of ["objectKey", "uploadedBy", "byteLength", "createdAt", "id"]) {
    expect(writeFileInput.safeParse({ ...input, [field]: "forged" }).success).toBe(false);
  }
  expect(readFileInput.safeParse({ workspaceSlug: "alder", fileId: "../bucket/key" }).success).toBe(
    false,
  );
});

it("accepts up to 25 MiB of bytes", () => {
  const limit = 25 * 1024 * 1024;
  expect(writeFileInput.safeParse({ ...input, bytes: new Uint8Array(limit) }).success).toBe(true);
  expect(writeFileInput.safeParse({ ...input, bytes: new Uint8Array(limit + 1) }).success).toBe(
    false,
  );
});

it("rejects control characters in file metadata", () => {
  expect(writeFileInput.safeParse({ ...input, originalFilename: "bad\u0001name" }).success).toBe(
    false,
  );
  expect(writeFileInput.safeParse({ ...input, mimeType: "text/plain; x=\n" }).success).toBe(false);
});
