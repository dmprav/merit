import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, mocked, waitFor, within } from "storybook/test";

import { PageHeader } from "@merit/ui/page-header";

import { StoryEnvironment } from "../../../tests/storybook";
import { AppPage, AppShell } from "../../app/app-shell";
import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import { readDemo, startDemo } from "./data/server/demo.functions";
import { DemoGuidance } from "./demo-tools";

const workspace = {
  id: "example",
  slug: "demo-example",
  name: "Alder Foundation",
  kind: "demo" as const,
  demoExpiresAt: "2027-01-25T12:00:00.000Z",
  canWorkOnGrants: true,
  canViewTeam: true,
};

const ready = {
  status: "ready" as const,
  workspaceSlug: workspace.slug,
  expiresAt: workspace.demoExpiresAt,
  applicationRef: "workshop-example",
  roundRef: "local-connections-example",
};

const Preview = () => (
  <StoryEnvironment path="/app/demo-example/rounds" routePath="/app/$workspaceSlug/rounds">
    <WorkspaceNavigationContext
      value={{ workspaces: [workspace], canAdminister: false, draftScope: "demo-example" }}
    >
      <DemoGuidance>
        <AppShell current={{ kind: "workspace", workspace }}>
          <AppPage breadcrumb={null}>
            <PageHeader title="Funding rounds" />
          </AppPage>
        </AppShell>
      </DemoGuidance>
    </WorkspaceNavigationContext>
  </StoryEnvironment>
);

const meta = {
  title: "Features/Demo/Guidance",
  tags: ["!autodocs"],
  component: Preview,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Uses Components/Dialog/Popover as its frame, with matching tinted header and footer. Expiry appears as quiet context above the introduction. Suggested tasks use Components/Link/Standalone text links aligned with the prose. The footer contains only exit/reset controls and scrolls with the guidance when space is limited. Controls expand to 44px touch targets. The sidebar contains only the Demo guide button.",
      },
    },
  },
  beforeEach: () => {
    mocked(readDemo).mockResolvedValue(ready);
    mocked(startDemo).mockResolvedValue({ status: "unavailable" });
  },
} satisfies Meta<typeof Preview>;

export default meta;

export const Open: StoryObj<typeof meta> = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const guide = await body.findByRole("button", { name: "Demo guide" });

    await waitFor(() => expect(guide).toBeEnabled());
    await userEvent.click(guide);

    const dialog = await body.findByRole("dialog", { name: "Demo guide" });
    await waitFor(() =>
      expect(within(dialog).getByText(/You’re preparing funding recommendations/)).toBeVisible(),
    );
    await expect(
      within(dialog).getByText(/Workshop Saturdays has lost its free venue/),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Review a revised request" }),
      ).toBeVisible(),
    );
    await expect(
      await within(dialog).findByRole("link", { name: "Review Workshop Saturdays" }),
    ).toHaveAttribute("href", "/app/demo-example/applications/workshop-example?tab=reviews");
    await expect(
      within(dialog).getByRole("link", { name: "Check the round budget" }),
    ).toHaveAttribute(
      "href",
      "/app/demo-example/rounds/local-connections-example?section=applications",
    );
    await expect(within(dialog).getByText("Demo expires 25 January 2027")).toBeVisible();
  },
};

export const TasksUnavailable: StoryObj<typeof meta> = {
  beforeEach: () => {
    mocked(readDemo).mockResolvedValue({ status: "unavailable" });
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await body.findByRole("button", { name: "Demo guide" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await userEvent.click(trigger);
    const dialog = await body.findByRole("dialog", { name: "Demo guide" });

    await expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "We couldn’t load the suggested tasks",
    );
    await expect(within(dialog).getByRole("button", { name: "Try again" })).toBeEnabled();
    await expect(within(dialog).getByRole("button", { name: "Reset demo" })).toBeEnabled();
  },
};

export const TaskLoadRecovery: StoryObj<typeof meta> = {
  beforeEach: () => {
    mocked(readDemo).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    await TasksUnavailable.play!(context);
    const body = within(context.canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog", { name: "Demo guide" });
    await context.userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));

    await expect(
      await within(dialog).findByRole("link", { name: "Review Workshop Saturdays" }),
    ).toBeVisible();
  },
};

export const MissingExample: StoryObj<typeof meta> = {
  beforeEach: () => {
    mocked(readDemo).mockResolvedValue({
      status: "ready",
      workspaceSlug: workspace.slug,
      expiresAt: workspace.demoExpiresAt,
    });
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await body.findByRole("button", { name: "Demo guide" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await userEvent.click(trigger);
    const dialog = await body.findByRole("dialog", { name: "Demo guide" });

    await expect(
      await within(dialog).findByRole("link", { name: "Explore funding rounds" }),
    ).toHaveAttribute("href", "/app/demo-example/rounds");
    await expect(
      within(dialog).queryByRole("link", { name: "Review Workshop Saturdays" }),
    ).toBeNull();
  },
};

export const ResetFailure: StoryObj<typeof meta> = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const guide = await body.findByRole("button", { name: "Demo guide" });

    await waitFor(() => expect(guide).toBeEnabled());

    await userEvent.click(guide);
    await userEvent.click(await body.findByRole("button", { name: "Reset demo" }));
    const dialog = await body.findByRole("dialog", { name: "Reset the demo?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset demo" }));

    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "We couldn’t reset the demo",
    );
    await expect(within(dialog).getByRole("button", { name: "Keep my changes" })).toBeEnabled();
  },
};
