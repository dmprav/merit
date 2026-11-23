import { assert, expect, it, vi } from "vite-plus/test";

import { testOperations } from "../../tests/operations";
import { publication } from "../app/publication";
import { createAssistantCatalog, type AssistantOperations } from "./catalog";
import { describeResult } from "./evidence";

const actor = { userId: "manager" };
const workspaceSlug = "alder";
const workspace = {
  id: "alder-id",
  slug: workspaceSlug,
  name: "Alder",
  kind: "standard",
  role: "program_manager",
  administration: "none",
  canWorkOnGrants: true,
  canViewTeam: true,
  demoExpiresAt: null,
} as const;
const contactId = "00000000-0000-4000-a000-000000000001";
const applicationId = "k7m2p9x4n6rt";
const requestId = "00000000-0000-4000-a000-000000000002";
const commandId = "00000000-0000-4000-a000-000000000003";

const setup = () => {
  const ops = {
    ...testOperations(),
    readWorkspace: vi.fn<AssistantOperations["readWorkspace"]>().mockResolvedValue(workspace),
  };
  vi.mocked(ops.organizations.workspaceHomeUrl).mockReturnValue("https://merit.test/app/alder");
  const catalog = createAssistantCatalog(actor, workspaceSlug, ops, "https://merit.test");
  return { ops, catalog };
};

it("advertises every workspace tool with the provider's input schema and filters by the current actor", async () => {
  const { ops, catalog } = setup();
  const tools = await catalog.list();
  expect(tools.map((tool) => tool.name).sort()).toEqual(
    Object.keys(publication)
      .filter((name) => name !== "start_demo")
      .sort(),
  );
  expect(tools.find((tool) => tool.name === "invite_reviewer")).toMatchObject({
    write: true,
    inputSchema: { type: "object", properties: { requestId: { type: "string" } } },
  });
  for (const tool of tools) {
    expect(tool.inputSchema.properties).not.toHaveProperty("workspaceSlug");
  }
  ops.readWorkspace.mockResolvedValue({
    ...workspace,
    role: "reviewer",
    canWorkOnGrants: false,
    canViewTeam: false,
  });
  expect((await catalog.list()).map((tool) => tool.name).sort()).toEqual([
    "get_reviewer_assignment",
    "list_my_reviews",
    "list_workspaces",
    "respond_to_review",
    "save_reviewer_draft",
    "submit_reviewer_assessment",
  ]);
  expect((await catalog.read("get_application", { applicationId })).result.status).toBe(
    "forbidden",
  );
  expect(ops.grantmaking.readApplication).not.toHaveBeenCalled();
});

it("keeps discovery, continuations and assignment reads inside the chat workspace", async () => {
  const { ops, catalog } = setup();
  expect((await catalog.read("list_workspaces", {})).result).toMatchObject({
    workspaces: [{ slug: "alder" }],
    nextPage: null,
  });
  expect(ops.organizations.workspacesPage).not.toHaveBeenCalled();
  vi.mocked(ops.reviewer.list).mockResolvedValue({ status: "ok", value: [] });
  await catalog.read("list_my_reviews", {});
  expect(ops.reviewer.list).toHaveBeenCalledExactlyOnceWith(actor, { workspaceSlug });
  expect(
    (
      await catalog.read("get_reviewer_assignment", {
        workspaceSlug: "other",
        assignmentId: commandId,
      })
    ).result.status,
  ).toBe("invalid_input");
  expect(ops.reviewer.read).not.toHaveBeenCalled();
});

it("checks each assignment returned by an uncited list, including loss of evidence access", async () => {
  const { ops, catalog } = setup();
  const observed = describeResult(
    "list_my_reviews",
    {},
    {
      status: "ok",
      assignments: [
        { id: commandId, basisComparison: { applicationVersion: "same" }, revision: 2 },
        { id: requestId, basisComparison: { applicationVersion: "unknown" }, revision: 1 },
      ],
    },
  );
  expect(observed.dependencies).toEqual([
    { kind: "reviewer" },
    { kind: "assignment", assignmentId: commandId, evidence: true },
    { kind: "assignment", assignmentId: requestId, evidence: false },
  ]);
  vi.mocked(ops.reviewer.read).mockResolvedValue({ status: "not_found" });
  expect(await catalog.permits(observed.dependencies)).toBe(false);
  expect(ops.reviewer.read).toHaveBeenCalledWith(actor, { workspaceSlug, assignmentId: commandId });
  ops.readWorkspace.mockResolvedValue(null);
  expect(await catalog.permits([])).toBe(false);
});

it("uses the version supplied by the source for material and assessment citations", async () => {
  const { ops, catalog } = setup();
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    fingerprint: "f".repeat(32),
    format: "json",
    offset: 0,
    nextOffset: null,
    totalCharacters: 2,
    content: "{}",
  });
  const result = await catalog.read("get_application_content", {
    applicationId,
    section: "material",
    materialVersion: 2,
  });
  expect(result.citations).toEqual([
    { kind: "material", recordId: applicationId, label: "material", version: "2" },
  ]);
  expect(
    describeResult(
      "list_application_reviews",
      { applicationId },
      {
        status: "ok",
        reviews: [
          {
            kind: "assessment",
            id: requestId,
            assessmentVersion: 3,
            reviewRevision: 8,
            reviewer: "Jo",
          },
        ],
      },
    ).citations,
  ).toEqual([{ kind: "assessment", recordId: requestId, label: "Jo", version: "3" }]);
});

it("binds an invitation to its exact recipient and refuses a changed contact", async () => {
  const { ops, catalog } = setup();
  vi.mocked(ops.grantmaking.readApplication).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      application: { applicationId, title: "Community garden", intakeRevision: 2 },
    }),
  );
  const content = JSON.stringify({ id: requestId, contactId, status: "outstanding" });
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    format: "json",
    fingerprint: "0".repeat(32),
    content,
    totalCharacters: content.length,
    offset: 0,
    nextOffset: null,
  });
  const contact = {
    contactId,
    name: "Jo",
    email: "jo@example.test",
    affiliation: "",
    archived: false,
    contactRevision: 3,
  };
  vi.mocked(ops.contacts.getContact).mockResolvedValue({ status: "ok", contact });
  const input = { applicationId, requestId, commandId, dueDate: null };
  const { preview } = await catalog.preview("invite_reviewer", input);
  assert(preview);
  expect(preview.effects).toEqual(["Send invitation email to jo@example.test."]);
  expect(preview.targets).toContainEqual({
    kind: "contact",
    label: "Jo",
    id: contactId,
    version: "3",
  });
  expect((await catalog.read("invite_reviewer", input)).result.status).toBe("invalid_input");
  vi.mocked(ops.contacts.getContact).mockResolvedValue({
    status: "ok",
    contact: { ...contact, email: "different@example.test", contactRevision: 4 },
  });
  expect((await catalog.execute(preview)).result.status).toBe("stale");
  expect(ops.reviewer.invite).not.toHaveBeenCalled();
  const updated = await catalog.preview("invite_reviewer", input);
  assert(updated.preview);
  vi.mocked(ops.reviewer.invite).mockResolvedValue({ status: "limited" });
  const outcome = await catalog.execute(updated.preview);
  expect(outcome.result.status).toBe("limited");
  expect(ops.reviewer.invite).toHaveBeenCalledExactlyOnceWith(actor, {
    publicId: applicationId,
    workspaceSlug,
    requestId,
    commandId,
    dueDate: null,
  });
});

it("returns the new revision for a separate approval before archiving a changed contact", async () => {
  const { catalog, ops } = setup();
  const contact = {
    contactId,
    name: "Jo",
    email: "jo@example.test",
    affiliation: "",
    archived: false,
    contactRevision: 2,
  };
  vi.mocked(ops.contacts.getContact).mockResolvedValue({ status: "ok", contact });
  const original = await catalog.preview("archive_contact", {
    contactId,
    expectedContactRevision: 2,
  });
  assert(original.preview);
  vi.mocked(ops.contacts.getContact).mockResolvedValue({
    status: "ok",
    contact: { ...contact, contactRevision: 3 },
  });
  const stale = await catalog.execute(original.preview);
  expect(stale.result.status).toBe("stale");
  assert(stale.retry);
  expect(stale.retry.input.expectedContactRevision).toBe(3);
  expect(ops.contacts.changeContact).not.toHaveBeenCalled();
  vi.mocked(ops.contacts.changeContact).mockResolvedValue({
    status: "ok",
    contact: {
      id: contactId,
      organizationId: workspace.id,
      name: contact.name,
      email: contact.email,
      affiliation: "",
      revision: 4,
      archived: true,
    },
  });
  expect((await catalog.execute(stale.retry)).result).toMatchObject({
    status: "ok",
    contact: { archived: true },
  });
  expect(ops.contacts.changeContact).toHaveBeenCalledExactlyOnceWith(actor, {
    action: "archive",
    workspaceSlug,
    contactId,
    expectedContactRevision: 3,
  });
});

it("prevents an unrelated optional selector from relabeling a source citation", async () => {
  const { catalog, ops } = setup();
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    fingerprint: "a".repeat(32),
    format: "json",
    offset: 0,
    nextOffset: null,
    totalCharacters: 2,
    content: "{}",
  });
  const observed = await catalog.read("get_application_content", {
    applicationId,
    section: "submission",
    materialVersion: 8,
    entryId: requestId,
  });
  expect(observed.citations).toEqual([
    { kind: "submission", label: "submission", recordId: applicationId, version: "a".repeat(32) },
  ]);
});
