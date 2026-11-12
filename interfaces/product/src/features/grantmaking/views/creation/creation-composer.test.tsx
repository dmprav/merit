import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { createQueryClient } from "@merit/query";

import { WebMessagesProvider } from "../../../../app/messages";
import { WorkspaceCreateAction } from "../../creation-action";
import { workspaceCreationData } from "../../data/creation/workspace-data";
import { createRound, createApplication } from "../../data/server/creation/creation.functions";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: ReactNode;
    to: string;
    params: Record<string, string>;
    className?: string;
  }) => (
    <a
      className={className}
      href={to.replace(/\$(\w+)/g, (match: string, key: string) => params[key] ?? match)}
    >
      {children}
    </a>
  ),
}));
vi.mock("../../data/server/creation/creation.functions", () => ({
  createRound: vi.fn(),
  createApplication: vi.fn(),
}));
beforeEach(() => {
  navigate.mockReset().mockResolvedValue(undefined);
  vi.mocked(createRound).mockReset().mockResolvedValue({ status: "ok", publicId: "k7m2p9x4n6rt" });
  vi.mocked(createApplication)
    .mockReset()
    .mockResolvedValue({ status: "ok", publicId: "k7m2p9x4n6rt" });
});

const setup = (application = false, client = createQueryClient()) => {
  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <GrantmakingDrafts>
          <WorkspaceCreateAction
            data={workspaceCreationData(
              client,
              application
                ? {
                    kind: "application",
                    workspaceSlug: "alder",
                    roundPublicId: "r7m2p9x4n6rt",
                    roundTitle: "Community grants",
                  }
                : { kind: "round", workspaceSlug: "alder", workspaceName: "Alder Foundation" },
              navigate,
            )}
          />
        </GrantmakingDrafts>
      </WebMessagesProvider>
    </QueryClientProvider>,
  );

  return userEvent.setup();
};

it("validates and retains all round fields on close, then retries the same creation and opens the round", async () => {
  vi.mocked(createRound)
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok", publicId: "k7m2p9x4n6rt" });
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  let dialog = within(screen.getByRole("dialog"));
  await user.keyboard("{Control>}{Enter}{/Control}");

  expect(createRound).not.toHaveBeenCalled();
  expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveFocus();

  await user.type(dialog.getByRole("textbox", { name: "Round name" }), "New connections");
  await user.type(dialog.getByRole("textbox", { name: "Purpose" }), "Bring neighbours together.");
  await user.type(screen.getByRole("textbox", { name: "Budget" }), "25000");
  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Resume funding round" }));
  dialog = within(screen.getByRole("dialog"));

  await waitFor(() => expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveFocus());
  expect(dialog.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    "Bring neighbours together.",
  );

  await user.keyboard("{Control>}{Enter}{/Control}");

  expect(await dialog.findByRole("alert")).toHaveTextContent("Your draft is still here");

  await user.keyboard("{Meta>}{Enter}{/Meta}");

  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      to: "/app/$workspaceSlug/rounds/$roundRef",
      params: { workspaceSlug: "alder", roundRef: "new-connections-k7m2p9x4n6rt" },
    }),
  );
  expect(createRound).toHaveBeenCalledTimes(2);
  expect(
    (
      vi.mocked(createRound).mock.calls[0] ??
      assert.fail("Expected vi.mocked(createRound).mock.calls[0]")
    )[0].data,
  ).toEqual(
    (
      vi.mocked(createRound).mock.calls[1] ??
      assert.fail("Expected vi.mocked(createRound).mock.calls[1]")
    )[0].data,
  );
  expect(
    (
      vi.mocked(createRound).mock.calls[1] ??
      assert.fail("Expected vi.mocked(createRound).mock.calls[1]")
    )[0].data,
  ).toMatchObject({
    title: "New connections",
    purpose: "Bring neighbours together.",
    budget: "25000.00",
    meetingDate: null,
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("retains an unfinished committee date and selects a calendar date without submitting creation", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  await user.type(screen.getByRole("textbox", { name: "Round name" }), "New connections");
  await user.type(screen.getByRole("textbox", { name: "Committee date" }), "2027-02-");
  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Resume funding round" }));
  const date = screen.getByRole("textbox", { name: "Committee date" });

  expect(date).toHaveValue("2027-02-");

  await user.click(screen.getByRole("button", { name: "Create funding round" }));

  expect(createRound).not.toHaveBeenCalled();
  await waitFor(() => expect(date).toHaveFocus());
  expect(date).toHaveAccessibleDescription(
    "Enter a valid date in YYYY-MM-DD format, within 10 years of the current year.",
  );

  await user.clear(date);
  await user.type(date, "2027-01-21");
  const trigger = screen.getByRole("button", { name: "Choose date for Committee date" });
  await user.click(trigger);
  await user.keyboard("{Escape}");

  expect(screen.getByRole("form", { name: "Create funding round" })).toBeVisible();
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Friday, 22 January 2027" }));

  expect(date).toHaveValue("2027-01-22");
  expect(createRound).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Create funding round" }));

  const expectedDate: unknown = expect.objectContaining({ meetingDate: "2027-01-22" });
  await waitFor(() =>
    expect(createRound).toHaveBeenCalledExactlyOnceWith({
      data: expectedDate,
    }),
  );
});

it("opens the saved application and clears the draft for the next creation", async () => {
  const user = setup(true);
  await user.click(screen.getByRole("button", { name: "Add application" }));
  let dialog = within(screen.getByRole("dialog"));

  expect(dialog.getByText("Community grants")).toBeVisible();

  await user.type(dialog.getByRole("textbox", { name: "Project title" }), "Community meals");
  await user.tab();

  expect(screen.getByRole("textbox", { name: "Applicant" })).toHaveFocus();

  await user.type(screen.getByRole("textbox", { name: "Applicant" }), "Neighbourhood Kitchen");
  await user.tab();

  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveFocus();

  const amount = screen.getByRole("textbox", { name: "Requested amount" });

  expect(dialog.getByText("€", { exact: true })).not.toBeVisible();

  await user.type(amount, "0");

  expect(dialog.getByText("€", { exact: true })).toBeVisible();
  expect(amount).toHaveFocus();

  await user.clear(amount);

  expect(dialog.getByText("€", { exact: true })).not.toBeVisible();
  expect(amount).toHaveFocus();

  await user.type(amount, "0");
  await user.tab();

  expect(screen.getByRole("textbox", { name: "Submitted material" })).toHaveFocus();

  await user.keyboard("Weekly meals.");
  await user.click(dialog.getByRole("button", { name: "Add application" }));

  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Add application" }));
  dialog = within(screen.getByRole("dialog"));

  expect(dialog.getByRole("textbox", { name: "Project title" })).toHaveValue("");
  expect(dialog.getByRole("textbox", { name: "Submitted material" })).toHaveValue("");
  expect(dialog.getByText("Submitted material", { exact: true })).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Add another" })).not.toBeInTheDocument();
  const generatedQuestionId: unknown = expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(
    (
      vi.mocked(createApplication).mock.calls[0] ??
      assert.fail("Expected vi.mocked(createApplication).mock.calls[0]")
    )[0].data,
  ).toMatchObject({
    publicId: "r7m2p9x4n6rt",
    applicant: "Neighbourhood Kitchen",
    requested: "0.00",
    answers: [
      {
        questionId: generatedQuestionId,
        question: "Submitted material",
        response: "Weekly meals.",
      },
    ],
  });

  await user.type(dialog.getByRole("textbox", { name: "Project title" }), "Second application");
  await user.click(dialog.getByRole("button", { name: "Add application" }));

  await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(2));
  expect(navigate).toHaveBeenCalledWith({
    to: "/app/$workspaceSlug/applications/$applicationRef",
    params: { workspaceSlug: "alder", applicationRef: "second-application-k7m2p9x4n6rt" },
  });
  expect(
    (
      vi.mocked(createApplication).mock.calls[1] ??
      assert.fail("Expected vi.mocked(createApplication).mock.calls[1]")
    )[0].data.requestId,
  ).not.toBe(
    (
      vi.mocked(createApplication).mock.calls[0] ??
      assert.fail("Expected vi.mocked(createApplication).mock.calls[0]")
    )[0].data.requestId,
  );
});

it("discards a creation explicitly and rejects malformed amounts before saving", async () => {
  const user = setup(true);
  await user.click(screen.getByRole("button", { name: "Add application" }));
  await user.type(screen.getByRole("textbox", { name: "Project title" }), "Draft");
  await user.type(screen.getByRole("textbox", { name: "Requested amount" }), "-1");
  await user.keyboard("{Control>}{Enter}{/Control}");

  expect(createApplication).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Discard draft" }));
  await user.click(screen.getByRole("button", { name: "Add application" }));

  expect(screen.getByRole("textbox", { name: "Project title" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("");
});

it.each([false, true])(
  "recovers a saved record inside and outside the dialog without losing the next draft (application: %s)",
  async (application) => {
    const client = createQueryClient();
    vi.spyOn(client, "invalidateQueries")
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce();
    navigate.mockRejectedValueOnce(new Error("Offline"));
    const user = setup(application, client);
    const createLabel = application ? "Add application" : "Create funding round";
    const fieldLabel = application ? "Project title" : "Round name";
    const openLabel = application ? "Open application" : "Open round";
    const create = application ? createApplication : createRound;
    await user.click(screen.getByRole("button", { name: createLabel }));
    await user.type(screen.getByRole("textbox", { name: fieldLabel }), "Saved record");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: createLabel }));

    expect(
      await screen.findByText("Created successfully, but the list could not refresh."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: openLabel })).toHaveAttribute(
      "href",
      `/app/alder/${application ? "applications" : "rounds"}/saved-record-k7m2p9x4n6rt`,
    );
    await user.click(screen.getByRole("button", { name: createLabel }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("link", { name: openLabel })).toBeVisible();
    expect(dialog.getByRole("textbox", { name: fieldLabel })).toHaveValue("");
    await user.type(dialog.getByRole("textbox", { name: fieldLabel }), "Next draft");

    await user.click(dialog.getByRole("button", { name: "Refresh list" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Created successfully, but the list could not refresh."),
      ).not.toBeInTheDocument(),
    );
    expect(
      dialog.getByText(
        "Created successfully, but the page could not open. Use the link above to continue.",
      ),
    ).toBeVisible();
    // Dismissal must keep focus usable even before the dialog's next animation frame.
    const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
    try {
      await user.click(dialog.getByRole("button", { name: "Dismiss confirmation" }));
      expect(dialog.getByRole("textbox", { name: fieldLabel })).toHaveFocus();
    } finally {
      frame.mockRestore();
    }
    expect(dialog.queryByRole("link", { name: openLabel })).not.toBeInTheDocument();
    expect(dialog.getByRole("textbox", { name: fieldLabel })).toHaveValue("Next draft");
    await waitFor(() => expect(dialog.getByRole("textbox", { name: fieldLabel })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(
      screen.getByRole("button", {
        name: application ? "Resume application" : "Resume funding round",
      }),
    );
    expect(screen.getByRole("textbox", { name: fieldLabel })).toHaveValue("Next draft");
    expect(screen.queryByRole("link", { name: openLabel })).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  },
);

it.each([false, true])(
  "keeps creation open and prevents repeat submission while saving (application: %s)",
  async (application) => {
    let complete: () => void = () => assert.fail("Creation has not started");

    const pending = new Promise<{ status: "ok"; publicId: string }>((resolve) => {
      complete = () => resolve({ status: "ok", publicId: "k7m2p9x4n6rt" });
    });
    const create = application ? createApplication : createRound;
    vi.mocked(create).mockReturnValueOnce(pending);
    const user = setup(application);
    const createLabel = application ? "Add application" : "Create funding round";
    const fieldLabel = application ? "Project title" : "Round name";
    await user.click(screen.getByRole("button", { name: createLabel }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: fieldLabel }), "Pending creation");
    await user.click(dialog.getByRole("button", { name: createLabel }));

    expect(dialog.getByRole("button", { name: "Creating…" })).toBeDisabled();
    for (const close of dialog.getAllByRole("button", { name: "Close" })) {
      expect(close).toBeDisabled();
    }
    expect(dialog.getByRole("button", { name: "Discard draft" })).toBeDisabled();
    await user.keyboard("{Escape}{Control>}{Enter}{/Control}");
    expect(dialog.getByRole("textbox", { name: fieldLabel })).toHaveValue("Pending creation");
    expect(create).toHaveBeenCalledTimes(1);

    complete();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigate).toHaveBeenCalledTimes(1);
  },
);

it("retries failed application creation with the keyboard without duplicating the request", async () => {
  vi.mocked(createApplication).mockResolvedValueOnce({ status: "unavailable" });
  const user = setup(true);
  await user.click(screen.getByRole("button", { name: "Add application" }));
  await user.type(screen.getByRole("textbox", { name: "Project title" }), "Community meals");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Add application" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is still here");

  await user.keyboard("{Control>}{Enter}{/Control}");

  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(
    (
      vi.mocked(createApplication).mock.calls[0] ??
      assert.fail("Expected vi.mocked(createApplication).mock.calls[0]")
    )[0].data,
  ).toEqual(
    (
      vi.mocked(createApplication).mock.calls[1] ??
      assert.fail("Expected vi.mocked(createApplication).mock.calls[1]")
    )[0].data,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps an open link to the saved record if navigation fails without retrying creation", async () => {
  navigate.mockRejectedValueOnce(new Error("Offline"));
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  await user.type(screen.getByRole("textbox", { name: "Round name" }), "Saved round");
  await user.keyboard("{Enter}");

  expect(
    await screen.findByText(
      "Created successfully, but the page could not open. Use the link above to continue.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open round" })).toHaveAttribute(
    "href",
    "/app/alder/rounds/saved-round-k7m2p9x4n6rt",
  );
  expect(createRound).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Create funding round" }));

  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue("");
});
