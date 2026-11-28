import { Buffer } from "node:buffer";

import { z } from "zod";

import { applicationPdfSchema, intakeLimits } from "@merit/applications/domain";
import type { Identity } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";
import type { FileReference } from "@merit/storage";

import type { createPdfRepository } from "../services.server";
import { readDemoPdf } from "./samples.server";
import { hasPdfPages } from "./validate.server";

type Repository = ReturnType<typeof createPdfRepository>;

type Storage = {
  writeFile: (bytes: Uint8Array) => Promise<FileReference>;
  readFile: (reference: FileReference) => Promise<Uint8Array<ArrayBuffer>>;
};

type Actor = Extract<Identity, { status: "authenticated" }>["actor"];

const privateHeaders = { "Cache-Control": "private, no-store" };

const fail = (status: number) => new Response(null, { status, headers: privateHeaders });

const caseTarget = z.strictObject({ applicationId: publicIdSchema });
const uploadTarget = z.union([caseTarget, z.strictObject({ roundId: publicIdSchema })]);
const readTarget = z.union([
  caseTarget.extend({ id: z.uuid() }),
  z.strictObject({ assignmentId: z.uuid(), id: z.uuid() }),
]);

const readUpload = async (request: Request, filename: string | null) => {
  const name = applicationPdfSchema.shape.filename.safeParse(filename);
  if (!name.success || request.headers.get("content-type")?.toLowerCase() !== "application/pdf") {
    return fail(415);
  }
  if (Number(request.headers.get("content-length")) > intakeLimits.pdfBytes) {
    return fail(413);
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return fail(415);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.length;
      if (size > intakeLimits.pdfBytes) {
        await reader.cancel();
        return fail(413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, size);
  if (
    !/^%PDF-\d\.\d/u.test(bytes.toString("latin1", 0, 8)) ||
    !/%%EOF\s*$/u.test(bytes.toString("latin1", Math.max(0, size - 1024))) ||
    !(await hasPdfPages(bytes))
  ) {
    return fail(415);
  }
  return { filename: name.data, bytes };
};

// The HTTP adapter can represent an empty POST as a zero-byte stream.
const hasUploadBytes = async (request: Request) => {
  if (request.body) {
    for await (const chunk of request.body) {
      if (chunk.byteLength) {
        return true;
      }
    }
  }
  return false;
};

const stagePdf = async (
  request: Request,
  workspaceSlug: string,
  actor: Actor,
  repo: Repository,
  storage: Storage,
) => {
  const params = new URL(request.url).searchParams;
  const sample = params.get("sample");
  const filename = params.get("filename");
  params.delete("sample");
  params.delete("filename");
  const parsed = uploadTarget.safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    return fail(400);
  }
  const target = { workspaceSlug, ...parsed.data };
  const kind = await repo.uploadAccess(actor, target);
  if (!kind) {
    return fail(404);
  }
  if (
    kind === "demo" &&
    (sample === null || filename !== null || (await hasUploadBytes(request)))
  ) {
    return fail(403);
  }
  if (kind !== "demo" && sample !== null) {
    return fail(400);
  }
  const upload = kind === "demo" ? readDemoPdf(sample) : await readUpload(request, filename);
  if (!upload) {
    return fail(400);
  }
  if (upload instanceof Response) {
    return upload;
  }
  const reference = await storage.writeFile(upload.bytes);
  const saved = await repo.register(actor, target, {
    filename: upload.filename,
    reference,
    sample: kind === "demo",
  });
  return saved ? Response.json(saved, { status: 201, headers: privateHeaders }) : fail(404);
};

const openPdf = async (
  request: Request,
  workspaceSlug: string,
  actor: Actor,
  repo: Repository,
  storage: Storage,
) => {
  const address = readTarget.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!address.success) {
    return fail(404);
  }
  const { data } = address;
  const file =
    "assignmentId" in data
      ? await repo.forReviewer(actor, { workspaceSlug, ...data })
      : await repo.forManager(actor, { workspaceSlug, ...data });
  if (!file) {
    return fail(404);
  }
  const bytes = await storage.readFile(file.reference);
  const filename = encodeURIComponent(file.filename).replace(
    /['()*]/gu,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new Response(bytes, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Content-Length": String(bytes.byteLength),
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
};

export const handleApplicationPdfHttp = async (
  request: Request,
  workspaceSlug: string,
  origin: string,
  currentIdentity: () => Promise<Identity>,
  repo: Repository,
  storage: Storage,
) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return fail(405);
  }
  if (request.method === "POST" && request.headers.get("origin") !== origin) {
    return fail(403);
  }
  if (!workspaceSlugSchema.safeParse(workspaceSlug).success) {
    return fail(404);
  }
  const identity = await currentIdentity();
  if (identity.status !== "authenticated") {
    return fail(identity.status === "signed_out" ? 401 : 503);
  }
  return request.method === "POST"
    ? stagePdf(request, workspaceSlug, identity.actor, repo, storage)
    : openPdf(request, workspaceSlug, identity.actor, repo, storage);
};
