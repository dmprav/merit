import type { Meta, StoryObj } from "@storybook/react-vite";
import { useParams } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { expect, waitFor, mocked, within } from "storybook/test";

import { StoryEnvironment } from "../../../tests/storybook";
import { AppShell } from "../../app/app-shell";
import { WorkspaceRecovery, WorkspaceStatusPage } from "../../app/workspace-page";
import { workspacesOptions } from "./data/queries";
import { readWorkspaces } from "./data/server/organization.functions";
import { WorkspaceChoice } from "./views/workspace-choice";
import { WorkspaceNavigationProvider } from "./workspace-navigation-provider";

type Workspaces = Extract<Awaited<ReturnType<typeof readWorkspaces>>, { status: "ok" }>;

const workspaces: Workspaces["value"] = [
  {
    id: "alder",
    slug: "alder",
    name: "Alder Foundation",
    kind: "standard",
    demoExpiresAt: null,
    role: "program_manager",
    canWorkOnGrants: true,
    administration: "owner",
  },
  {
    id: "birch",
    slug: "birch",
    name: "Birch Community and Neighbourhood Partnerships",
    kind: "standard",
    demoExpiresAt: null,
    role: "member",
    canWorkOnGrants: false,
    administration: "administrator",
  },
];

const WorkspacePreview = ({
  chooser = false,
  memberships = workspaces,
  canAdminister = false,
  status = "unavailable",
  resource = "application",
  slug = "alder",
}: {
  chooser?: boolean;
  memberships?: Workspaces["value"];
  canAdminister?: boolean;
  slug?: string;
  status?: ComponentProps<typeof WorkspaceStatusPage>["status"];
  resource?: ComponentProps<typeof WorkspaceStatusPage>["resource"];
}) => (
  <StoryEnvironment
    path={`/app/${slug}/applications/example`}
    routePath="/app/$workspaceSlug/$"
    prepare={(client) => {
      const result: Awaited<ReturnType<typeof readWorkspaces>> = {
        status: "ok",
        value: memberships,
        draftScope: "test-account",
        canAdminister,
      };
      client.setQueryData(workspacesOptions().queryKey, () => result);
    }}
  >
    {chooser ? (
      <WorkspaceChoice workspaces={memberships} canAdminister={canAdminister} />
    ) : (
      <WorkspaceNavigationProvider>
        <WorkspaceFrame memberships={memberships} status={status}>
          <WorkspaceStatusPage status={status} resource={resource} />
        </WorkspaceFrame>
      </WorkspaceNavigationProvider>
    )}
  </StoryEnvironment>
);

/** Mirrors the workspace layout: an entered workspace keeps its shell around a page's state. */
const WorkspaceFrame = ({
  memberships,
  status,
  children,
}: {
  memberships: Workspaces["value"];
  status: ComponentProps<typeof WorkspaceStatusPage>["status"];
  children: ReactNode;
}) => {
  const { workspaceSlug } = useParams({ strict: false });
  const workspace = memberships.find((item) => item.slug === workspaceSlug);
  return workspace && !["signed_out", "workspace_not_found", "no_workspace"].includes(status) ? (
    <AppShell current={{ kind: "workspace", workspace }}>{children}</AppShell>
  ) : (
    <WorkspaceRecovery status={status} />
  );
};

const meta = {
  title: "Features/Workspace/Entry and recovery",
  tags: ["!autodocs"],
  component: WorkspacePreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: ({ args }) => {
    mocked(readWorkspaces).mockResolvedValue({
      status: "ok",
      value: args.memberships ?? workspaces,
      draftScope: "test-account",
      canAdminister: args.canAdminister ?? false,
    });
  },
} satisfies Meta<typeof WorkspacePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ChooseWorkspace: Story = { args: { chooser: true } };
export const ChooseWorkspaceOrAdministration: Story = {
  args: { chooser: true, canAdminister: true },
};
export const FailedApplication: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(async () =>
      expect(
        await canvas.findByRole("heading", { name: "Application could not be loaded" }),
      ).toBeVisible(),
    );

    const navigation = canvas.queryByRole("button", { name: "Open navigation" });
    if (navigation) {
      await userEvent.click(navigation);
    }

    await waitFor(async () =>
      expect(
        await within(canvasElement.ownerDocument.body).findByRole("link", {
          name: "Funding rounds",
        }),
      ).toBeVisible(),
    );
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(body.getByRole("link", { name: "Funding rounds" })).not.toHaveAttribute(
      "aria-current",
    );

    if (navigation) {
      await userEvent.keyboard("{Escape}");
    }
  },
};
export const MissingRound: Story = { args: { resource: "round", status: "not_found" } };
export const LoadingTeam: Story = { args: { resource: "team", status: "loading" } };
export const WithoutGrantAccess: Story = {
  args: { slug: "birch" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Application could not be loaded" });
    const navigation = canvas.queryByRole("button", { name: "Open navigation" });
    if (navigation) {
      await userEvent.click(navigation);
    }
    const body = within(canvasElement.ownerDocument.body);

    await waitFor(async () =>
      expect(await body.findByRole("link", { name: "Workspace settings" })).toBeVisible(),
    );
    await expect(body.queryByRole("link", { name: "Funding rounds" })).not.toBeInTheDocument();
    await expect(body.queryByRole("link", { name: "Applications" })).not.toBeInTheDocument();

    if (navigation) {
      await userEvent.keyboard("{Escape}");
    }
  },
};
export const InaccessibleWorkspace: Story = {
  args: { slug: "missing", status: "workspace_not_found" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      "/app",
    );
    await expect(canvas.queryByRole("complementary")).not.toBeInTheDocument();
  },
};
export const NoWorkspace: Story = {
  args: { memberships: [], status: "no_workspace" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  },
};
export const OperatorRecovery: Story = {
  args: {
    memberships: [],
    canAdminister: true,
    status: "workspace_not_found",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      "/admin/organizations",
    );
  },
};
export const SessionEnded: Story = {
  args: { status: "signed_out" },
  play: async ({ canvas }) => {
    await waitFor(async () =>
      expect(await canvas.findByRole("link", { name: "Sign in" })).toBeVisible(),
    );
    await expect(canvas.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  },
};
