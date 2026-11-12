import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Brand } from "../../components/brand/brand";
import { Icon } from "../../components/icon/icon";
import { PageHeader } from "../page-header/page-header";
import { StateMessage } from "../state-message/state-message";
import {
  ApplicationRecovery,
  ApplicationAccount,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationPage,
  ApplicationShell,
} from "./application-shell";
import styles from "./application-shell.module.css";

const meta = {
  title: "Patterns/Application shell",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { name: "Alder Foundation", loading: false, signedIn: false },
  render: ({ name, loading, signedIn }) => (
    <ApplicationShell
      brand={
        <a href="#main">
          <Brand />
        </a>
      }
      contextLabel={name}
      navigationLabel="Main navigation"
      skipLabel="Skip to content"
      openNavigationLabel="Open navigation"
      closeNavigationLabel="Close navigation"
      identity={
        <ApplicationContext name={name} label="Switch workspace">
          <a href="#main" aria-current="true">
            <ApplicationContextOption name={name} />
          </a>
          <a href="#main">
            <ApplicationContextOption name="Birch Foundation" />
          </a>
        </ApplicationContext>
      }
      navigation={
        <>
          <a href="#main" aria-current="page">
            <Icon name="layers" />
            Funding rounds
          </a>
          <a href="#main" className={styles.navigationGroupStart}>
            <Icon name="contacts" />
            Contacts
          </a>
          <a href="#main">
            <Icon name="team" />
            Team
          </a>
        </>
      }
      footer={
        <ApplicationAccount
          name={loading ? null : "Dana Reed"}
          loadingLabel="Loading account…"
          menuLabel="Account menu"
          signOut={
            signedIn
              ? {
                  label: "Sign out",
                  pendingLabel: "Signing out…",
                  errorMessage: "Could not sign out. Try again.",
                  run: async () => {
                    throw new Error("Example failed request");
                  },
                }
              : undefined
          }
        />
      }
    >
      <ApplicationPage
        locationKey="rounds"
        breadcrumb={["Funding rounds"]}
        breadcrumbLabel="Breadcrumb"
      >
        <PageHeader title="Funding rounds" description="Prepare grant work for review." />
      </ApplicationPage>
    </ApplicationShell>
  ),
} satisfies Meta<{ name: string; loading: boolean; signedIn: boolean }>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Workspace: Story = {};
export const LongWorkspaceName: Story = {
  args: { name: "Birch Community Foundation for Arts, Education and Neighbourhood Development" },
};

export const WorkspaceSwitcher: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Open workspace navigation with the current workspace marked. Compare compact rows with Action menu / Keyboard and the selection cue with Select / Open. Entries remain real links. At narrow widths the story opens the navigation drawer first.",
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    const navigation = canvas.queryByRole("button", { name: "Open navigation" });
    if (navigation) {
      await userEvent.click(navigation);
    }

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: `${args.name}: Switch workspace` }));
    const popup = body.getByRole("dialog", { name: "Switch workspace" });

    await waitFor(() => expect(popup).toBeVisible());
    await expect(within(popup).getByRole("link", { name: args.name })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(within(popup).getByRole("link", { name: "Birch Foundation" })).toBeVisible();
  },
};

export const WorkspaceSwitcherLongName: Story = {
  ...WorkspaceSwitcher,
  args: LongWorkspaceName.args,
  parameters: {
    docs: {
      description: {
        story:
          "The open switcher shows the full workspace name while preserving its selection cue.",
      },
    },
  },
};

export const LoadingAccount: Story = { args: { loading: true } };
export const AccountMenu: Story = { args: { signedIn: true } };

export const InaccessibleWorkspace: Story = {
  render: () => (
    <ApplicationRecovery
      locationKey="unavailable"
      brand="merit"
      returnLink={
        <a href="#main">
          <Icon name="left" />
          Back to Merit
        </a>
      }
      account={
        <ApplicationAccount
          name="Dana Reed"
          loadingLabel="Loading account…"
          menuLabel="Account menu"
          signOut={{
            label: "Sign out",
            pendingLabel: "Signing out…",
            errorMessage: "Could not sign out. Try again.",
            run: async () => {
              throw new Error("Example failed request");
            },
          }}
        />
      }
    >
      <StateMessage
        title="Workspace not available"
        description="This workspace isn’t available to your account. If you expected access, contact your organization."
      />
    </ApplicationRecovery>
  ),
};
