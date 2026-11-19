import { AwsClient } from "aws4fetch";
import { z } from "zod";

import type { FileObjects } from "@merit/storage";

const settings = z.object({
  FILE_STORAGE_ENDPOINT: z.url({ protocol: /^https?$/u }),
  FILE_STORAGE_REGION: z.string().min(1),
  FILE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/),
  FILE_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  FILE_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
});

export const createFileObjects = (env: NodeJS.ProcessEnv): FileObjects => {
  const request = async (key: string, init: RequestInit) => {
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
        headers: { "If-None-Match": "*", "x-amz-content-sha256": sha256 },
        body: bytes,
      });
    },
    async get(key, byteLength) {
      const response = await request(key, { method: "GET" });
      if (response.headers.get("content-length") !== String(byteLength)) {
        await response.body?.cancel();
        throw new Error("Stored file length does not match its metadata.");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
};
