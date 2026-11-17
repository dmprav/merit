import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import type { ApplicationDocuments } from "@merit/applications/api";
import { encodeBase64 } from "@merit/applications/domain";

import type { ApplicationDocumentSession } from "../../contracts/documents";
import { Messages } from "../../messages";
import { ApplicationDocuments as Documents } from "./application-documents";

const recorder = { userId: "dana", name: "Dana Reed" };
const recordedAt = "2027-03-02T15:04:00.000Z";

const documents = (): ApplicationDocuments => ({
  proposal: {
    currentVersion: 2,
    versions: [
      {
        version: 2,
        filename: "Community-meals-proposal.pdf",
        pageCount: 3,
        byteSize: 20,
        recorder,
        recordedAt,
      },
      {
        version: 1,
        filename: "proposal-draft.pdf",
        pageCount: 3,
        byteSize: 18,
        recorder,
        recordedAt: "2027-02-11T09:30:00.000Z",
      },
    ],
    citations: [
      {
        id: "b8q3w5j7c2df",
        role: "proposal",
        version: 1,
        page: 2,
        note: "The weekly meal count is on this page.",
        recorder,
        recordedAt: "2027-02-12T11:00:00.000Z",
        currentVersion: 2,
      },
    ],
  },
  budget: {
    currentVersion: 1,
    versions: [
      {
        version: 1,
        filename: "Community-meals-budget.pdf",
        pageCount: 2,
        byteSize: 12,
        recorder,
        recordedAt,
      },
    ],
    citations: [],
  },
});

const session = (
  overrides: Partial<ApplicationDocumentSession> = {},
): ApplicationDocumentSession => ({
  attach: vi.fn(async () => ({ status: "ok" as const, version: 1, documents: documents() })),
  cite: vi.fn(async () => ({
    status: "ok" as const,
    citationId: "c8q3w5j7c2df",
    documents: documents(),
  })),
  readFile: vi.fn(async () => ({
    status: "ok" as const,
    role: "proposal" as const,
    version: 2,
    filename: "Community-meals-proposal.pdf",
    pageCount: 3,
    byteSize: 5,
    contentBase64: encodeBase64(new TextEncoder().encode("%PDF-")),
  })),
  refresh: vi.fn(async () => {}),
  ...overrides,
});

const show = (
  value: ApplicationDocuments | undefined,
  options: {
    mode?: "manage" | "review";
    canWrite?: boolean;
    session?: ApplicationDocumentSession;
    initialNotice?: string;
  } = {},
) => {
  const current = options.session ?? session();
  render(
    <Documents
      documents={value}
      mode={options.mode ?? "manage"}
      canWrite={options.canWrite ?? true}
      session={current}
      initialNotice={options.initialNotice}
    />,
    { wrapper: Messages },
  );
  return { user: userEvent.setup(), session: current };
};

const revokeObjectURL = vi.fn();

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:proposal");
  revokeObjectURL.mockClear();
  URL.revokeObjectURL = revokeObjectURL;
});

it("offers an attach action for each empty slot", () => {
  show(undefined);
  expect(screen.getByRole("heading", { name: "Source documents" })).toBeVisible();
  expect(screen.getByText("No proposal attached")).toBeVisible();
  expect(screen.getByText("No budget attached")).toBeVisible();
  expect(screen.getByRole("button", { name: "Attach proposal" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Attach budget" })).toBeVisible();
  expect(screen.getByLabelText("Proposal PDF")).toHaveAttribute("tabindex", "-1");
  expect(screen.getByLabelText("Budget PDF")).toHaveAttribute("tabindex", "-1");
});

it("shows the current version, earlier versions, and a citation of an older version", () => {
  show(documents());
  expect(screen.getByText("Community-meals-proposal.pdf")).toBeVisible();
  expect(screen.getByText("Version 2")).toBeVisible();
  expect(screen.getByText("3 pages")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Earlier versions" })).toBeVisible();
  expect(screen.getAllByText("Version 1").length).toBeGreaterThan(0);
  expect(screen.getByText("The weekly meal count is on this page.")).toBeVisible();
  expect(screen.getByText("Version 1, page 2")).toBeVisible();
  expect(screen.getByText("Current version is 2")).toBeVisible();
  expect(screen.getAllByText("Dana Reed").length).toBeGreaterThan(0);
});

it("opens a reader on the requested page and returns focus to the control that opened it", async () => {
  const { user } = show(documents());
  const opener = screen.getByRole("button", { name: "View Proposal version 2" });
  await user.click(opener);
  const frame = await screen.findByTitle("Proposal version 2, page 1");
  expect(frame).toHaveAttribute("src", "blob:proposal#page=1");
  expect(screen.getByRole("heading", { name: "Community-meals-proposal.pdf" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  frame.dataset.mark = "kept";
  await user.click(screen.getByRole("button", { name: "Next" }));
  const next = screen.getByTitle("Proposal version 2, page 2");
  expect(next).toHaveAttribute("src", "blob:proposal#page=2");
  expect(next).not.toHaveAttribute("data-mark");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Back to documents" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "View Proposal version 2" })).toHaveFocus(),
  );
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:proposal");
});

it("revokes the previous blob address when the reader bytes change", async () => {
  const create = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  URL.createObjectURL = create;
  const revoke = vi.fn();
  URL.revokeObjectURL = revoke;
  const { user } = show(documents());
  await user.click(screen.getByRole("button", { name: "View Proposal version 2" }));
  await screen.findByTitle("Proposal version 2, page 1");
  await user.click(screen.getByRole("button", { name: "View Proposal version 1, page 2" }));
  await screen.findByTitle("Proposal version 1, page 2");
  expect(revoke).toHaveBeenCalledWith("blob:first");
});

it("keeps an empty or partial page while it is edited and restores it on blur", async () => {
  const readFile = vi.fn(async () => ({
    status: "ok" as const,
    role: "proposal" as const,
    version: 2,
    filename: "Community-meals-proposal.pdf",
    pageCount: 12,
    byteSize: 5,
    contentBase64: encodeBase64(new TextEncoder().encode("%PDF-")),
  }));
  const { user } = show(documents(), { session: session({ readFile }) });
  await user.click(screen.getByRole("button", { name: "View Proposal version 2" }));
  const page = await screen.findByRole("textbox", { name: "Page" });
  await user.clear(page);
  expect(page).toHaveValue("");
  expect(screen.getByTitle("Proposal version 2, page 1")).toBeVisible();
  await user.type(page, "6");
  expect(page).toHaveValue("6");
  expect(screen.getByTitle("Proposal version 2, page 6")).toBeVisible();
  await user.type(page, "0");
  expect(page).toHaveValue("60");
  expect(screen.getByTitle("Proposal version 2, page 6")).toBeVisible();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Page" })).toHaveValue("6");
});

it("says the PDF could not be attached when saving throws", async () => {
  const attach = vi.fn(async () => {
    throw new Error("offline");
  });
  const { user } = show(undefined, { session: session({ attach }) });
  await user.upload(
    screen.getByLabelText("Proposal PDF"),
    new File(["%PDF-"], "notes.pdf", { type: "application/pdf" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This PDF could not be attached. Try again.",
  );
});

it("starts a citation view on that page and shows a saved reference without a toast", async () => {
  const value = documents();
  const saved = documents();
  saved.proposal.citations = [
    {
      id: "c8q3w5j7c2df",
      role: "proposal",
      version: 2,
      page: 2,
      note: "See the budget table",
      recorder,
      recordedAt,
      currentVersion: 2,
    },
    ...value.proposal.citations,
  ];
  const transport = session({
    cite: vi.fn(async () => ({
      status: "ok" as const,
      citationId: "c8q3w5j7c2df",
      documents: saved,
    })),
  });
  const { user } = show(value, { session: transport });
  await user.click(screen.getByRole("button", { name: "View Proposal version 1, page 2" }));
  expect(await screen.findByTitle("Proposal version 1, page 2")).toHaveAttribute(
    "src",
    "blob:proposal#page=2",
  );
  await user.click(screen.getByRole("button", { name: "Refer to this page" }));
  await user.type(screen.getByRole("textbox", { name: "Note" }), "See the budget table");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("See the budget table")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByTitle("Proposal version 1, page 2")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([
  ["not_pdf", "This file is not a PDF."],
  ["too_large", "This PDF is larger than 20 MB."],
  ["unreadable_pdf", "This PDF could not be read."],
  ["conflict", "Someone else attached a newer version. Review it, then attach again."],
  ["application_withdrawn", "This application is withdrawn. Reinstate it to make changes."],
] as const)("keeps an upload error visible for %s", async (error, message) => {
  const attach = vi.fn(async () =>
    error === "conflict" ? { status: "conflict" as const } : { status: "invalid" as const, error },
  );
  const { user } = show(undefined, { session: session({ attach }) });
  const input = screen.getByLabelText("Proposal PDF");
  await user.upload(input, new File(["%PDF-"], "notes.pdf", { type: "application/pdf" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByText("No proposal attached")).toBeVisible();
});

it("disables the attach action while it is pending", async () => {
  let resolve: (
    value: Awaited<ReturnType<NonNullable<ApplicationDocumentSession["attach"]>>>,
  ) => void = () => {};

  const attach = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<NonNullable<ApplicationDocumentSession["attach"]>>>>(
        (done) => {
          resolve = done;
        },
      ),
  );
  const { user } = show(undefined, { session: session({ attach }) });
  await user.upload(
    screen.getByLabelText("Proposal PDF"),
    new File(["%PDF-"], "proposal.pdf", { type: "application/pdf" }),
  );
  expect(screen.getByRole("button", { name: "Attach proposal" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Attach budget" })).toBeDisabled();
  expect(screen.getByLabelText("Proposal PDF")).toBeDisabled();
  expect(screen.getByLabelText("Budget PDF")).toBeDisabled();
  resolve({ status: "ok", version: 1, documents: documents() });
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Upload new version" })[0]).toBeEnabled(),
  );
});

it("refreshes after a conflict and replaces the list from a newer documents prop", async () => {
  const refresh = vi.fn(async () => {});
  const attach = vi.fn(async () => ({ status: "conflict" as const }));
  const current = session({ attach, refresh });
  const { rerender } = render(
    <Documents documents={undefined} mode="manage" canWrite session={current} />,
    { wrapper: Messages },
  );
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText("Proposal PDF"),
    new File(["%PDF-"], "notes.pdf", { type: "application/pdf" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Someone else attached a newer version. Review it, then attach again.",
  );
  expect(refresh).toHaveBeenCalled();
  expect(screen.getByText("No proposal attached")).toBeVisible();
  rerender(<Documents documents={documents()} mode="manage" canWrite session={current} />);
  expect(await screen.findByText("Community-meals-proposal.pdf")).toBeVisible();
  expect(screen.getByText("Version 2")).toBeVisible();
  expect(screen.queryByText("No proposal attached")).not.toBeInTheDocument();
});

it("keeps the list when a version cannot be opened", async () => {
  const { user } = show(documents(), {
    session: session({ readFile: vi.fn(async () => ({ status: "not_found" as const })) }),
  });
  await user.click(screen.getByRole("button", { name: "View Proposal version 2" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This version could not be opened. Try again.",
  );
  expect(screen.getByText("Community-meals-proposal.pdf")).toBeVisible();
  expect(screen.queryByTitle(/Proposal version/)).not.toBeInTheDocument();
});

it("hides attach, upload, and refer while the application is withdrawn", () => {
  show(documents(), { canWrite: false });
  expect(screen.getByRole("button", { name: "View Proposal version 2" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Upload new version" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach proposal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refer to this page" })).not.toBeInTheDocument();
});

it("shows one empty sentence to a reviewer and no write actions", () => {
  show(undefined, { mode: "review", canWrite: false });
  expect(screen.getByText("No proposal or budget is attached.")).toBeVisible();
  expect(screen.queryByText("No proposal attached")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach proposal" })).not.toBeInTheDocument();
});
