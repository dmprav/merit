import { AwsClient } from "aws4fetch";
import { z } from "zod";

import { fileByteLength, fileObjectKey, type FileObjects } from "@merit/storage";

const settings = z.object({
  FILE_STORAGE_ENDPOINT: z.url({ protocol: /^https?$/u }),
  FILE_STORAGE_REGION: z.string().min(1),
  FILE_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)
    .refine((name) => !name.includes("..")),
  FILE_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  FILE_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
});

const lengthMismatch = "Stored file length does not match its metadata.";

const readFileBody = async (response: Response, byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        if (chunk.value.byteLength > byteLength - offset) {
          await reader.cancel();
          throw new Error(lengthMismatch);
        }
        bytes.set(chunk.value, offset);
        offset += chunk.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (offset !== byteLength) {
    throw new Error(lengthMismatch);
  }
  return bytes;
};

export const createFileObjects = (env: NodeJS.ProcessEnv): FileObjects => {
  const request = async (key: string, init: RequestInit) => {
    fileObjectKey.parse(key);
    const config = settings.safeParse(env);
    if (!config.success) {
      throw new Error("Private file storage is not configured.");
    }
    const {
      FILE_STORAGE_ENDPOINT,
      FILE_STORAGE_REGION,
      FILE_STORAGE_BUCKET,
      FILE_STORAGE_ACCESS_KEY_ID,
      FILE_STORAGE_SECRET_ACCESS_KEY,
    } = config.data;
    const base = new URL(FILE_STORAGE_ENDPOINT);
    if (
      base.protocol !== "https:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
    ) {
      throw new Error("Private file storage requires HTTPS outside localhost.");
    }
    const client = new AwsClient({
      service: "s3",
      region: FILE_STORAGE_REGION,
      accessKeyId: FILE_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: FILE_STORAGE_SECRET_ACCESS_KEY,
      retries: 0,
    });
    base.pathname = `${base.pathname.replace(/\/$/u, "")}/${FILE_STORAGE_BUCKET}/${key}`;
    const response = await client.fetch(base, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Private file storage ${init.method} failed (HTTP ${response.status}).`);
    }
    return response;
  };

  return {
    async put(key, bytes, sha256) {
      await request(key, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "If-None-Match": "*",
          "x-amz-content-sha256": sha256,
        },
        body: bytes,
      });
    },
    async get(key, byteLength) {
      fileByteLength.parse(byteLength);
      const response = await request(key, {
        method: "GET",
        headers: { "Accept-Encoding": "identity" },
      });
      const encoding = response.headers.get("content-encoding");
      if (encoding !== null && encoding.toLowerCase() !== "identity") {
        await response.body?.cancel();
        throw new Error("Unexpected content encoding for stored file.");
      }
      if (response.headers.get("content-length") !== String(byteLength)) {
        await response.body?.cancel();
        throw new Error(lengthMismatch);
      }
      return readFileBody(response, byteLength);
    },
  };
};
