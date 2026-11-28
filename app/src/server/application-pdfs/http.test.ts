import { Buffer } from "node:buffer";

import { expect, it, vi } from "vite-plus/test";

import { intakeLimits } from "@merit/applications/domain";

import { handleApplicationPdfHttp } from "./http.server";
import { readDemoPdf } from "./samples.server";

const origin = "https://merit.example";
const workspace = "alder";
const roundId = "01h000000000";
const id = "cd1a7e38-7457-4c84-97d7-a53120949e31";
const pdf = { id, filename: "Budget.pdf", byteLength: 25 };
const reference = { objectKey: "files/" + id, byteLength: 25, sha256: "0".repeat(64) };
const actor = { userId: "manager" };

const transport = (kind: "standard" | "demo" | null = "standard") => {
  const repo = {
    uploadAccess: vi.fn(async () => kind),
    register: vi.fn(async () => pdf),
    forManager: vi.fn(async () => ({ filename: pdf.filename, reference })),
    forReviewer: vi.fn(async () => null),
  };
  const storage = {
    writeFile: vi.fn(async (_data: Uint8Array) => reference),
    readFile: vi.fn(async () => new Uint8Array(25)),
  };

  const send = (params: string, init?: RequestInit) =>
    handleApplicationPdfHttp(
      new Request(origin + "/api/application-pdfs/alder?" + params, init),
      workspace,
      origin,
      async () => ({ status: "authenticated", actor }),
      repo,
      storage,
    );

  return { repo, storage, send };
};

const upload: RequestInit = {
  method: "POST",
  headers: { origin, "content-type": "application/pdf" },
  body: new Uint8Array(readDemoPdf("budget")!.bytes),
};
const roundUpload = "roundId=" + roundId + "&filename=Budget.pdf";

it("requires same-origin manager access before storing a file and returns only public metadata", async () => {
  const denied = transport(null);
  expect((await denied.send(roundUpload, upload)).status).toBe(404);
  expect(denied.storage.writeFile).not.toHaveBeenCalled();
  const { repo, storage, send } = transport();
  expect(
    (await send(roundUpload, { ...upload, headers: { origin: "https://other.example" } })).status,
  ).toBe(403);
  expect(repo.uploadAccess).not.toHaveBeenCalled();
  const result = await send(roundUpload, upload);
  expect(result.status).toBe(201);
  expect(await result.json()).toEqual(pdf);
  expect(storage.writeFile).toHaveBeenCalledOnce();
  expect(repo.register).toHaveBeenCalledWith(
    actor,
    { workspaceSlug: workspace, roundId },
    {
      filename: pdf.filename,
      reference,
      sample: false,
    },
  );
});

it("rejects incorrect file contents and enforces the size limit without Content-Length", async () => {
  const { storage, send } = transport();
  expect((await send(roundUpload, { ...upload, body: "plain text" })).status).toBe(415);
  expect((await send(roundUpload, { ...upload, body: "%PDF-1.7\ntruncated" })).status).toBe(415);
  expect(
    (await send(roundUpload, { ...upload, body: new Uint8Array(intakeLimits.pdfBytes + 1) }))
      .status,
  ).toBe(413);
  expect((await send(roundUpload, { ...upload, body: "%PDF-1.7\n1 0 obj\n%%EOF\n" })).status).toBe(
    415,
  );
  expect(storage.writeFile).not.toHaveBeenCalled();
});

it("stages only bundled demo samples, with no client-provided bytes", async () => {
  const { storage, send } = transport("demo");
  const options = { method: "POST", headers: { origin } };
  const base = "roundId=" + roundId + "&sample=";
  expect((await send(roundUpload, upload)).status).toBe(403);
  expect((await send(base + "proposal", upload)).status).toBe(403);
  expect((await send(base + "unknown", options)).status).toBe(400);
  expect(storage.writeFile).not.toHaveBeenCalled();
  for (const sample of ["proposal", "budget", "revised-budget"]) {
    const res = await send(base + sample, options);
    expect(res.status).toBe(201);
    const bytes = storage.writeFile.mock.lastCall?.[0];
    expect(
      Buffer.from(bytes ?? [])
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect(bytes).toEqual(readDemoPdf(sample)?.bytes);
  }
});

it("reads bytes through the addressed case or assignment and serves a private inline PDF", async () => {
  const { repo, storage, send } = transport();
  expect((await send("assignmentId=" + id + "&id=" + id)).status).toBe(404);
  expect(storage.readFile).not.toHaveBeenCalled();
  expect(repo.forManager).not.toHaveBeenCalled();
  const opened = await send("applicationId=" + roundId + "&id=" + id);
  expect(opened.status).toBe(200);
  expect(opened.headers.get("content-type")).toBe("application/pdf");
  expect(opened.headers.get("content-disposition")).toContain("inline;");
  expect(opened.headers.get("cache-control")).toBe("private, no-store");
  expect(storage.readFile).toHaveBeenCalledExactlyOnceWith(reference);
});
