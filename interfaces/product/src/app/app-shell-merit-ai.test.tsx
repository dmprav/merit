import type { ConnectConnectionAdapter } from "@tanstack/ai-client";
import { EventType } from "@tanstack/ai/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { readDemo } from "../features/demo/data/server/demo.functions";
import { createScriptedConnection, type Pace } from "../features/merit-ai/data/scripts";
import { MeritAiSetup } from "../features/merit-ai/merit-ai";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { AppShell, type ShellContext, type ShellWorkspace } from "./app-shell";
import { WebMessagesProvider } from "./messages";

vi.mock("../features/demo/data/server/demo.functions", () => ({
  readDemo: vi.fn(),
  startDemo: vi.fn(),
}));

const demo: ShellWorkspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "demo",
  canWorkOnGrants: true,
  canViewTeam: false,
};
const standard: ShellWorkspace = { ...demo, kind: "standard", canViewTeam: true };

const instant: Pace = { start: 0, word: 0, step: 0 };
// Real references: the demo hands out the bare public ID, and the application page's own
// reference is the canonical `<slug>-<id>`.
const workshopId = "k3m9p2x7t4wq";
const exampleHome = `/app/alder/applications/workshop-saturdays-${workshopId}`;
const question = "What changed in version 2, and do the reviews cover it?";

const failingOnce = (inner: ConnectConnectionAdapter): ConnectConnectionAdapter => {
  let failed = false;
  return {
    ...inner,
    connect: async function* (messages, data, signal, input) {
      if (failed) {
        yield* inner.connect(messages, data, signal, input);
        return;
      }
      failed = true;
      yield {
        type: EventType.RUN_STARTED,
        runId: input.runId,
        threadId: input.threadId,
        timestamp: Date.now(),
      };
      yield {
        type: EventType.RUN_ERROR,
        message: "The connection dropped.",
        timestamp: Date.now(),
      };
    },
  };
};

const show = async ({
  workspace = demo,
  path = exampleHome,
  pace = instant,
  open = false,
  failDecisions = 0,
  failFirstRun = false,
}: {
  workspace?: ShellWorkspace;
  path?: string;
  pace?: Pace;
  open?: boolean;
  failDecisions?: number;
  /** The first answer ends in an error; the next ones are scripted. */
  failFirstRun?: boolean;
} = {}) => {
  const current: ShellContext = { kind: "workspace", workspace };
  const root = createRootRoute({
    component: () => (
      <WorkspaceNavigationContext value={{ workspaces: [workspace], canAdminister: false }}>
        <AppShell current={current}>
          <main id="main" tabIndex={-1}>
            <label>
              Notes
              <input />
            </label>
          </main>
        </AppShell>
      </WorkspaceNavigationContext>
    ),
  });

  const page = (routePath: string, title?: string) =>
    createRoute({ getParentRoute: () => root, path: routePath, loader: () => ({ title }) });

  const router = createRouter({
    routeTree: root.addChildren([
      page("/app/$workspaceSlug/applications/$applicationRef", "Workshop Saturdays"),
      page("/app/$workspaceSlug/applications/$other/second", "Boat repairs"),
      page("/app/$workspaceSlug/rounds"),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <MeritAiSetup
      value={{
        createConnection: (questions) => {
          const scripted = createScriptedConnection({ questions, pace, failDecisions });
          return failFirstRun ? failingOnce(scripted) : scripted;
        },
        isInitiallyOpen: open,
      }}
    >
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MeritAiSetup>,
    { wrapper: WebMessagesProvider },
  );
  await waitFor(() => expect(document.getElementById("main")).not.toBeNull());
  return { router, user: userEvent.setup() };
};

let platform: MockInstance<() => string>;

let isWide = false;

const wide = (matches: boolean) => {
  isWide = matches;
  return Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: matches && query === "(min-width: 1400px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
};

beforeEach(() => {
  platform = vi.spyOn(window.navigator, "platform", "get");
  platform.mockReturnValue("Linux x86_64");
  window.localStorage.clear();
  vi.mocked(readDemo).mockResolvedValue({
    status: "ready",
    workspaceSlug: "alder",
    expiresAt: "2027-01-25T12:00:00.000Z",
    applicationRef: workshopId,
    roundRef: "local-connections-example",
  });
});
afterEach(() => {
  wide(false);
  vi.restoreAllMocks();
});

const pressJ = (init: KeyboardEventInit, target: Element = document.body) => {
  const event = new KeyboardEvent("keydown", {
    key: "j",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

/** The panel's scrolling content. */
const panel = () => screen.findByRole("region", { name: "Merit AI" });

/** The whole panel: its content and the footer below it, beside the page or as a sheet over it. */
const surface = () => screen.findByRole(isWide ? "complementary" : "dialog", { name: "Merit AI" });

/** Everything the panel's status regions are saying to assistive technology. */
const spoken = (panel: { getAllByRole: (role: string) => HTMLElement[] }) =>
  panel
    .getAllByRole("status")
    .map((region) => region.textContent)
    .join("");

const messageBox = async () =>
  within(await surface()).getByRole("textbox", { name: "Message to Merit AI" });

/** Types a question and waits for it to be sent and answered. */
const ask = async (user: Awaited<ReturnType<typeof show>>["user"], text: string) => {
  await user.type(await messageBox(), `${text}{Enter}`);
};

describe("availability", () => {
  it("offers Merit AI after Search in a demo workspace, with its shortcut", async () => {
    await show();
    const navigation = within(screen.getByRole("complementary")).getByRole("navigation");
    const button = within(navigation).getByRole("button", { name: "Ask Merit AI" });

    expect(button).toHaveTextContent("Ctrl J");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+J");
    expect(
      within(navigation).getByRole("button", { name: "Search" }).compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows ⌘ J on Apple platforms", async () => {
    platform.mockReturnValue("MacIntel");
    await show();
    const button = screen.getByRole("button", { name: "Ask Merit AI" });

    expect(button).toHaveTextContent("⌘ J");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Meta+J");
  });

  it("leaves other workspaces as they are", async () => {
    await show({ workspace: standard });

    expect(screen.queryByRole("button", { name: "Ask Merit AI" })).not.toBeInTheDocument();
    expect(pressJ({ ctrlKey: true }).defaultPrevented).toBe(false);
    expect(screen.queryByRole("region", { name: "Merit AI" })).not.toBeInTheDocument();
  });
});

describe("opening", () => {
  it("opens beside the page with focus in the message box and its description", async () => {
    const { user } = await show();
    await user.click(screen.getByRole("button", { name: "Ask Merit AI" }));

    await waitFor(async () => expect(await messageBox()).toHaveFocus());
    expect(await messageBox()).toHaveAccessibleDescription(
      "Demo preview: answers are recorded examples.",
    );
    expect(await messageBox()).toHaveAttribute("placeholder", "Ask about this page");
    expect(screen.getByRole("log", { name: "Conversation with Merit AI" })).toBeVisible();
  });

  it("toggles with the shortcut from a text field and keeps the browser from using it", async () => {
    const { user } = await show();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    await user.click(notes);

    const opened = pressJ({ ctrlKey: true }, notes);

    expect(opened.defaultPrevented).toBe(true);
    await waitFor(async () => expect(await messageBox()).toHaveFocus());

    expect(pressJ({ ctrlKey: true }, await messageBox()).defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Merit AI" })).toBeNull());
  });

  it.each([
    {
      name: "⌘J on Apple platforms",
      platform: "MacIntel",
      opens: { metaKey: true },
      ignores: { ctrlKey: true },
    },
    {
      name: "Ctrl+J elsewhere",
      platform: "Win32",
      opens: { ctrlKey: true },
      ignores: { metaKey: true },
    },
  ])("answers only $name", async ({ platform: value, opens, ignores }) => {
    platform.mockReturnValue(value);
    await show();

    expect(pressJ(ignores).defaultPrevented).toBe(false);
    expect(pressJ({ ...opens, shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressJ({ ...opens, altKey: true }).defaultPrevented).toBe(false);
    expect(pressJ({ key: "l", ...opens }).defaultPrevented).toBe(false);
    expect(screen.queryByRole("region", { name: "Merit AI" })).not.toBeInTheDocument();

    expect(pressJ(opens).defaultPrevented).toBe(true);
    expect(await panel()).toBeVisible();
  });

  it("closes the compact navigation drawer before opening", async () => {
    const matchMedia = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((query) =>
      Object.assign(matchMedia(query), { matches: query === "(max-width: 600px)" }),
    );
    const { user } = await show();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Main navigation" })).toBeVisible();

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Ask Merit AI" }),
    );

    expect(await panel()).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
  });

  it("stays open, with the conversation, as the person moves between pages", async () => {
    const { user, router } = await show({ open: true });
    await user.type(await messageBox(), "Who is the applicant?{Enter}");
    await screen.findByText(/In this demo, Merit AI answers suggested questions/);

    await act(() =>
      router.navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
    );

    expect(await panel()).toBeVisible();
    expect(screen.getByText("Who is the applicant?")).toBeVisible();
    expect(screen.getByText(/In this demo, Merit AI answers suggested questions/)).toBeVisible();
  });
});

describe("the panel's width", () => {
  const resize = async (user: Awaited<ReturnType<typeof show>>["user"]) => {
    const separator = await screen.findByRole("separator", { name: "Resize Merit AI" });
    separator.focus();
    await user.keyboard("{ArrowLeft}");
    return separator;
  };

  it("is saved where the person resizes it and restored on the next visit", async () => {
    wide(true);
    const first = await show({ open: true });
    const separator = await resize(first.user);
    expect(separator).toHaveAttribute("aria-valuenow", "432");

    document.body.innerHTML = "";
    wide(true);
    await show({ open: true });

    expect(await screen.findByRole("separator", { name: "Resize Merit AI" })).toHaveAttribute(
      "aria-valuenow",
      "432",
    );
  });

  it("falls back to the default when storage cannot be read or written", async () => {
    wide(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    const { user } = await show({ open: true });

    const separator = await resize(user);

    expect(separator).toHaveAttribute("aria-valuenow", "432");
  });
});

describe("page context", () => {
  it("attaches the page's title as one removable chip until the page changes", async () => {
    const { user, router } = await show({ open: true });
    const body = within(await surface());
    expect(body.getByText("Workshop Saturdays")).toBeVisible();

    await user.click(
      body.getByRole("button", { name: "Remove Workshop Saturdays from the question" }),
    );

    expect(body.queryByText("Workshop Saturdays")).not.toBeInTheDocument();
    expect(
      body.queryByRole("button", { name: /What changed in version 2/ }),
    ).not.toBeInTheDocument();

    await act(async () => {
      router.history.push("/app/alder/applications/other/second");
      await router.load();
    });

    expect(await body.findByText("Boat repairs")).toBeVisible();
  });

  it("shows no chip on pages without a record", async () => {
    await show({ open: true, path: "/app/alder/rounds" });
    const body = within(await surface());

    expect(body.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(
      body.queryByRole("button", { name: /What changed in version 2/ }),
    ).not.toBeInTheDocument();
  });
});

describe("the example page", () => {
  it("is recognised by its public ID, whatever slug its reference carries", async () => {
    const { user } = await show({ open: true });
    const body = within(await surface());

    await user.click(await body.findByRole("button", { name: question }));

    expect(
      await body.findByText(/Version 2 raises the request from €18,000 to €22,000/),
    ).toBeVisible();
    expect(
      body.getByRole("button", { name: "Read 2 submissions and checked 2 review requests" }),
    ).toHaveAttribute("aria-expanded", "false");
    const log = within(body.getByRole("log", { name: "Conversation with Merit AI" }));
    expect(log.getByText("You")).toBeInTheDocument();
    expect(log.getByText("Merit AI")).toBeInTheDocument();
  });

  it("is recognised when the demo's reference is itself canonical", async () => {
    vi.mocked(readDemo).mockResolvedValue({
      status: "ready",
      workspaceSlug: "alder",
      expiresAt: "2027-01-25T12:00:00.000Z",
      applicationRef: `workshop-saturdays-${workshopId}`,
      roundRef: "local-connections-example",
    });
    await show({ open: true, path: `/app/alder/applications/renamed-${workshopId}` });

    expect(await within(await surface()).findByRole("button", { name: question })).toBeVisible();
  });

  it("is not another application, even one whose reference ends alike", async () => {
    await show({
      open: true,
      path: "/app/alder/applications/boat-repairs-b8d5f1h6j2nr",
    });
    const body = within(await surface());
    await body.findByText("Workshop Saturdays");

    expect(
      body.queryByRole("button", { name: /What changed in version 2/ }),
    ).not.toBeInTheDocument();
  });

  it("is not recognised from a reference without a public ID", async () => {
    await show({ open: true, path: "/app/alder/applications/workshop-example" });
    const body = within(await surface());
    await body.findByText("Workshop Saturdays");

    expect(
      body.queryByRole("button", { name: /What changed in version 2/ }),
    ).not.toBeInTheDocument();
  });

  it("says where to find the recorded examples when the page is not the example", async () => {
    const { user } = await show({ open: true, path: "/app/alder/rounds" });
    await ask(user, question);
    const body = within(await surface());

    expect(
      await body.findByText(/Open the Workshop Saturdays application to try them\./),
    ).toBeVisible();
    expect(body.queryByRole("button", { name: question })).not.toBeInTheDocument();
  });
});

describe.each([
  { name: "pushed beside the page", pushed: true },
  { name: "as a sheet over the page", pushed: false },
])("focus and announcements $name", ({ pushed }) => {
  beforeEach(() => wide(pushed));

  it("keeps focus in the message box when a suggestion is chosen", async () => {
    const { user } = await show({ open: true });
    const body = within(await surface());

    await user.click(await body.findByRole("button", { name: question }));
    await body.findByText(/Version 2 raises the request/);

    expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveFocus();
  });

  it.each([
    { choice: "Approve", result: "Approved", spoken: "Approved. Demo preview: nothing was sent." },
    { choice: "Decline", result: "Declined", spoken: "Declined. Nothing was changed." },
  ])("moves focus to the folded proposal after $choice and says the outcome", async (step) => {
    const { user } = await show({ open: true });
    const body = within(await surface());
    await user.click(
      await body.findByRole("button", { name: /Draft a question to the applicant/ }),
    );
    await user.click(await body.findByRole("button", { name: step.choice }));

    await body.findByText(new RegExp(step.result));
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent("Send a message to Maya Thompson"),
    );
    expect(await surface()).toContainElement(document.activeElement as HTMLElement);
    await waitFor(() => expect(spoken(body)).toContain(step.spoken));
  });
});

describe("a decision that cannot be recorded", () => {
  it("shows the failure beside both choices, and records the next one chosen", async () => {
    const { user } = await show({ open: true, failDecisions: 1 });
    const body = within(await surface());
    await user.click(
      await body.findByRole("button", { name: /Draft a question to the applicant/ }),
    );
    await user.click(await body.findByRole("button", { name: "Approve" }));

    expect(await body.findByText("Couldn't record your decision. Try again.")).toBeVisible();
    expect(body.getByRole("button", { name: "Approve" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(body.getByRole("button", { name: "Decline" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(body.getByRole("button", { name: "Decline" }));

    expect(await body.findByText("Declined. Nothing was changed.")).toBeVisible();
    expect(body.queryByText("Couldn't record your decision. Try again.")).not.toBeInTheDocument();
  });
});

describe("a failed answer", () => {
  // Beside the page nothing contains focus, so what the button leaves behind is lost to the body.
  beforeEach(() => wide(true));

  it("keeps focus in the message box when it is tried again", async () => {
    const { user } = await show({ open: true, failFirstRun: true });
    const body = within(await surface());
    await ask(user, question);
    // The person reached the button from the keyboard, so it holds the focus that must not be lost.
    (await body.findByRole("button", { name: "Try again" })).focus();
    await user.keyboard("{Enter}");

    await body.findByText(/Version 2 raises the request/);
    expect(body.queryByText("Couldn't finish this answer.")).not.toBeInTheDocument();
    expect(body.getByRole("textbox", { name: "Message to Merit AI" })).toHaveFocus();
  });
});

describe("announcements", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const proposalAnswer =
    "The replacement venue isn't booked yet. Here's a question for Maya Thompson:";

  it("says each finished answer once, not again when the panel is reopened", async () => {
    const { user } = await show({ open: true });
    const body = within(await surface());
    await user.click(
      await body.findByRole("button", { name: /Draft a question to the applicant/ }),
    );
    await waitFor(() => expect(spoken(body)).toContain(proposalAnswer));

    await user.keyboard("{Control>}j{/Control}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Merit AI" })).toBeNull());
    await user.keyboard("{Control>}j{/Control}");
    const reopened = within(await surface());
    await reopened.findByText(proposalAnswer);

    // The panel's own announcement takes 100 milliseconds to arrive.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(spoken(reopened)).toBe("");
  });
});
