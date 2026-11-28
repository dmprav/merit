import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { intakeLimits, type ApplicationPdf } from "@merit/applications/domain";

import type { PdfUpload } from "../../contracts/pdf-upload";
import { Messages } from "../../messages";
import { SubmittedPdfField } from "./submitted-pdf-field";

const document = (filename: string) => ({ id: crypto.randomUUID(), filename, byteLength: 200 });

const uploadFiles = (source: File[]) => {
  fireEvent.change(screen.getByLabelText("Choose PDFs", { selector: "input" }), {
    target: { files: source },
  });
};

const file = (name: string) => new File(["pdf"], name, { type: "application/pdf" });

const Editor = ({ upload, initial = [] }: { upload: PdfUpload; initial?: ApplicationPdf[] }) => {
  const [value, setValue] = useState(initial);
  return (
    <Messages>
      <SubmittedPdfField
        upload={upload}
        value={value}
        onChange={setValue}
        onPendingChange={() => {}}
      />
    </Messages>
  );
};

it("keeps valid PDFs when a selection includes a non-PDF, oversized file and sixth file", async () => {
  const large = file("large.pdf");
  Object.defineProperty(large, "size", { value: intakeLimits.pdfBytes + 1 });
  const stage = vi.fn<PdfUpload["stage"]>(async (source) => ({
    status: "ok",
    pdf: document(source instanceof File ? source.name : source),
  }));
  render(
    <Editor
      upload={{ mode: "files", stage }}
      initial={[1, 2, 3, 4].map((n) => document(`${n}.pdf`))}
    />,
  );
  uploadFiles([file("letter.txt"), large, file("budget.pdf"), file("extra.pdf")]);

  expect(await screen.findByRole("button", { name: "Remove budget.pdf" })).toBeVisible();
  for (const n of [1, 2, 3, 4]) {
    expect(screen.getByRole("button", { name: `Remove ${n}.pdf` })).toBeVisible();
  }
  for (const rejected of ["letter.txt", "large.pdf", "extra.pdf"]) {
    expect(screen.queryByRole("button", { name: `Remove ${rejected}` })).not.toBeInTheDocument();
  }
  expect(screen.getByRole("alert")).toHaveTextContent("letter.txt");
  expect(screen.getByRole("alert")).toHaveTextContent("large.pdf exceeds 25 MB");
  expect(screen.getByRole("alert")).toHaveTextContent("up to five PDFs");
  expect(screen.getAllByRole("button", { name: /^Remove /u })).toHaveLength(5);
});

it("retains the old document on a failed replacement and can replace or remove it on retry", async () => {
  const user = userEvent.setup();
  const stage = vi
    .fn<PdfUpload["stage"]>()
    .mockResolvedValueOnce({ status: "invalid" })
    .mockResolvedValueOnce({ status: "ok", pdf: document("revised.pdf") });
  render(<Editor upload={{ mode: "files", stage }} initial={[document("original.pdf")]} />);

  const replace = async (name: string) => {
    await user.click(screen.getByRole("button", { name: "Replace original.pdf" }));
    fireEvent.change(screen.getByLabelText("Replace original.pdf", { selector: "input" }), {
      target: { files: [file(name)] },
    });
  };

  await replace("invalid.pdf");
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid.pdf");
  await replace("revised.pdf");
  const remove = await screen.findByRole("button", { name: "Remove revised.pdf" });
  expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();
  await user.click(remove);
  expect(screen.queryByText("revised.pdf")).not.toBeInTheDocument();
});

it("offers only Merit sample choices in a demo", async () => {
  const user = userEvent.setup();
  const stage = vi
    .fn<PdfUpload["stage"]>()
    .mockResolvedValue({ status: "ok", pdf: document("proposal.pdf") });
  render(<Editor upload={{ mode: "samples", stage }} />);

  expect(screen.queryByLabelText("Choose PDFs", { selector: "input" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Choose a sample PDF" }));
  await user.click(screen.getByRole("menuitem", { name: "Sample proposal" }));
  expect(await screen.findByRole("button", { name: "Remove proposal.pdf" })).toBeVisible();
});

it("keeps keyboard focus among the PDF controls after removing a file", async () => {
  const user = userEvent.setup();
  render(
    <Editor
      upload={{ mode: "files", stage: vi.fn() }}
      initial={[document("original.pdf"), document("budget.pdf")]}
    />,
  );
  screen.getByRole("button", { name: "Remove original.pdf" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Replace budget.pdf" })).toHaveFocus();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Choose PDFs" })).toHaveFocus();
});
