import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { NavigationPin } from "@merit/grantmaking/api";
import { ApplicationPage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

import { StoryEnvironment } from "../../../tests/storybook";
import { AppShell } from "../../app/app-shell";
import { NavigationPinsContext } from "./context";
import { PinButton } from "./pin-button";

const application: NavigationPin = {
  target: { kind: "application", id: "000000000001" },
  title: "Neighbour Table",
  context: "Local Connections 2027",
  workspaceSlug: "alder",
};

const PinsPreview = ({ pins }: { pins: NavigationPin[] }) => (
  <StoryEnvironment path="/app/alder/applications/neighbour-table-000000000001">
    <NavigationPinsContext
      value={{
        pins,
        loading: false,
        unavailable: false,
        busy: false,
        retry: fn(),
        change: fn(async () => true),
      }}
    >
      <AppShell
        current={{
          kind: "workspace",
          workspace: {
            id: "alder",
            name: "Alder Foundation",
            slug: "alder",
            kind: "standard",
            canWorkOnGrants: true,
            canViewTeam: true,
          },
        }}
      >
        <ApplicationPage
          locationKey="pin-preview"
          breadcrumb={[
            <a href="#main" key="applications">
              Applications
            </a>,
            pins[0]!.title,
          ]}
          breadcrumbLabel="Breadcrumb"
          breadcrumbAction={<PinButton target={application.target} title={pins[0]!.title} />}
        >
          <PageHeader title={pins[0]!.title} />
        </ApplicationPage>
      </AppShell>
    </NavigationPinsContext>
  </StoryEnvironment>
);

const meta = {
  title: "Features/Workspace/Pins",
  component: PinsPreview,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { pins: [application] },
} satisfies Meta<typeof PinsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pinned: Story = {};
export const LongNames: Story = {
  args: {
    pins: [
      {
        ...application,
        title: "Neighbourhood connections through shared meals and community activities",
        context: "Community participation and neighbourhood development 2027",
      },
    ],
  },
};
export const PinContextMenu: Story = {
  args: {
    pins: [
      application,
      {
        ...application,
        target: { kind: "application", id: "000000000002" },
        title: "Ride Together",
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const openNavigation = canvas.queryByRole("button", { name: "Open navigation" });
    if (openNavigation) {
      await userEvent.click(openNavigation);
    }
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await body.findByRole("link", {
      name: "Neighbour Table Local Connections 2027",
    });
    trigger.focus();
    await userEvent.pointer({ keys: "[MouseRight]", target: trigger });
    await waitFor(() => expect(body.getByRole("menuitem", { name: "Move down" })).toBeVisible());
  },
};

export const ManyPins: Story = {
  args: {
    pins: Array.from({ length: 12 }, (_, index) => ({
      ...application,
      target: { kind: "application", id: `0000000000${String(index + 1).padStart(2, "0")}` },
      title:
        index < 2
          ? "Neighbourhood connections through shared meals and community activities"
          : `Community project ${index + 1}`,
      context: index === 1 ? "Local Connections 2028" : application.context,
    })),
  },
};
/** The pinned list collapses under its heading; a long list scrolls with the sidebar. */
export const CollapsedPins: Story = {
  ...ManyPins,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const openNavigation = canvas.queryByRole("button", { name: "Open navigation" });
    if (openNavigation) {
      await userEvent.click(openNavigation);
    }
    const body = within(canvasElement.ownerDocument.body);
    const toggle = body.getByRole("button", { name: "Pinned 12" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(body.queryByRole("link", { name: /^Community project 3/ })).not.toBeInTheDocument(),
    );
  },
};
