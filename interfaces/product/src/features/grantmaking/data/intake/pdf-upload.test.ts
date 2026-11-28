import { afterEach, expect, it, vi } from "vite-plus/test";

import { applicationPdfUpload } from "./pdf-upload";

const pdf = { id: crypto.randomUUID(), filename: "Proposal & plan.pdf", byteLength: 200 };

afterEach(() => vi.unstubAllGlobals());

it("stages a file in the creation round and validates the returned PDF", async () => {
  const send = vi.fn().mockResolvedValue(Response.json(pdf));
  vi.stubGlobal("fetch", send);

  const source = new File(["%PDF-1.7"], pdf.filename, { type: "application/pdf" });
  const signal = new AbortController().signal;
  const upload = applicationPdfUpload("alder", "standard", { roundId: "round" });
  await expect(upload.stage(source, signal)).resolves.toEqual({ status: "ok", pdf });
  expect(send).toHaveBeenCalledWith(
    "/api/application-pdfs/alder?roundId=round&filename=Proposal+%26+plan.pdf",
    { method: "POST", body: source, headers: { "Content-Type": "application/pdf" }, signal },
  );
});

it("sends only the sample key for a demo application and reports server validation failures", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(Response.json(pdf))
    .mockResolvedValueOnce(new Response(null, { status: 413 }))
    .mockResolvedValueOnce(new Response(null, { status: 415 }));
  vi.stubGlobal("fetch", send);

  const signal = new AbortController().signal;
  const upload = applicationPdfUpload("sample", "demo", { applicationId: "application" });
  expect(upload.mode).toBe("samples");
  await expect(upload.stage("proposal", signal)).resolves.toEqual({ status: "ok", pdf });
  expect(send).toHaveBeenCalledWith(
    "/api/application-pdfs/sample?applicationId=application&sample=proposal",
    { method: "POST", signal },
  );
  await expect(upload.stage("budget", signal)).resolves.toEqual({ status: "oversized" });
  await expect(upload.stage("budget", signal)).resolves.toEqual({ status: "invalid" });
});
