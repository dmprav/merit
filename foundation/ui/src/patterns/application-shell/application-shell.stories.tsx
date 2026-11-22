import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Brand } from "../../components/brand/brand";
import { Icon } from "../../components/icon/icon";
import { MessageBox } from "../message-box/message-box";
import { PageHeader } from "../page-header/page-header";
import { StateMessage } from "../state-message/state-message";
import { showToast } from "../toast/toast";
import {
  ApplicationRecovery,
  ApplicationAccount,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationNavigationButton,
  ApplicationPage,
  ApplicationShell,
  useCloseNavigation,
} from "./application-shell";
import styles from "./application-shell.module.css";
import storyStyles from "./application-shell.stories.module.css";

/** The panel remounts its content when the screen crosses 1400 pixels, so the draft lives with the caller. */
const AssistantConversation = ({
  draft,
  onDraftChange,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
}) => (
  <div className={storyStyles.conversation}>
    <ul className={storyStyles.messages}>
      <li>Which applications in this round still need a second review?</li>
      <li className={storyStyles.reply}>
        Three applications have one review so far: Riverside Youth Arts, Harbour Learning Garden,
        and Northside Repair Cafe.
      </li>
    </ul>
    <MessageBox
      label="Message"
      isLabelHidden
      placeholder="Ask about this round"
      value={draft}
      onChange={onDraftChange}
      sendLabel="Send message"
      onSend={() => onDraftChange("")}
      stopLabel="Stop"
      onStop={() => {}}
      autoFocus
    />
  </div>
);

/** Closes the compact navigation drawer before opening the panel over the page. */
const AssistantOpener = ({ onOpen }: { onOpen: () => void }) => {
  const closeNavigation = useCloseNavigation();

  return (
    <ApplicationNavigationButton
      icon="search"
      label="Open assistant"
      onPress={() => {
        closeNavigation();
        onOpen();
      }}
    />
  );
};

type ShellExampleProps = {
  name: string;
  loading: boolean;
  signedIn: boolean;
  /** Shows the companion panel, opened or closed, with its opener in the navigation. */
  companion?: { open: boolean; width?: number };
};

const ShellExample = ({ name, loading, signedIn, companion }: ShellExampleProps) => {
  const [open, setOpen] = useState(companion?.open ?? false);
  const [draft, setDraft] = useState("");

  return (
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
          {companion && <AssistantOpener onOpen={() => setOpen(true)} />}
        </>
      }
      companion={
        companion && {
          label: "Assistant",
          isOpen: open,
          onClose: () => setOpen(false),
          closeLabel: "Close assistant",
          resizeLabel: "Resize assistant",
          width: companion.width,
          onWidthChange: fn(),
          children: <AssistantConversation draft={draft} onDraftChange={setDraft} />,
        }
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
  );
};

const meta = {
  title: "Patterns/Application shell",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { name: "Alder Foundation", loading: false, signedIn: false },
  render: (args) => <ShellExample {...args} />,
} satisfies Meta<ShellExampleProps>;

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

const companionPlay: Story["play"] = async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  // A labelled region beside the page from 1400 pixels, a modal sheet below.
  const panel = await body.findByRole(
    window.matchMedia("(min-width: 1400px)").matches ? "complementary" : "dialog",
    { name: "Assistant" },
  );
  // The modal sheet fades in.
  await waitFor(() => expect(panel).toBeVisible());
  await waitFor(() =>
    expect(within(panel).getByRole("textbox", { name: "Message" })).toHaveFocus(),
  );
};

const companionDescription = (story: string) => ({
  docs: { description: { story } },
});

export const AssistantPanel: Story = {
  args: { companion: { open: true } },
  parameters: companionDescription(
    "The companion panel at its starting 416 pixels. From 1400 pixels wide it pushes the page content aside; below that it opens as a modal sheet.",
  ),
  play: companionPlay,
};

export const AssistantPanelWithToast: Story = {
  args: { companion: { open: true } },
  parameters: companionDescription(
    "A toast stays centered on the page area beside the open panel instead of the whole window.",
  ),
  play: async (context) => {
    await companionPlay?.(context);
    showToast({ tone: "success", message: "Recommendation saved" });
    const toast = await within(context.canvasElement.ownerDocument.body).findByRole("alertdialog", {
      name: "Recommendation saved",
    });
    // The toast fades in.
    await waitFor(() => expect(toast).toBeVisible());
  },
};

export const AssistantPanelWidest: Story = {
  args: { companion: { open: true, width: 560 } },
  parameters: companionDescription(
    "The widest the panel resizes to. In the modal sheet the width is fixed at 400 pixels.",
  ),
  play: companionPlay,
};

export const AssistantPanelClosed: Story = {
  args: { companion: { open: false } },
  parameters: companionDescription(
    "Closed, the shell renders as without a panel. Opening it returns focus to this control when it closes.",
  ),
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
