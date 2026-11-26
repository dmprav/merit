import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../../components/button/button";
import { Inline, Stack } from "../../components/layout/layout";
import { ApplicationPage, ApplicationShell } from "../application-shell/application-shell";
import { PageHeader } from "../page-header/page-header";
import { showToast, Toasts, type ToastMessage } from "./toast";

const examples = {
  saved: { tone: "success", message: "Recommendation saved" },
  undo: {
    tone: "success",
    message: "Criterion removed",
    action: { label: "Undo", onPress: fn() },
  },
  refreshFailed: {
    tone: "warning",
    message: "Saved, but the latest round could not be loaded.",
    action: { label: "Refresh", onPress: fn() },
  },
  failed: { tone: "danger", message: "The address could not be copied." },
} satisfies Record<string, ToastMessage>;

const Triggers = () => (
  <Inline>
    <Button onPress={() => showToast(examples.saved)}>Save</Button>
    <Button variant="secondary" onPress={() => showToast(examples.undo)}>
      Remove criterion
    </Button>
    <Button variant="secondary" onPress={() => showToast(examples.refreshFailed)}>
      Save with a failed refresh
    </Button>
    <Button variant="secondary" onPress={() => showToast(examples.failed)}>
      Copy address
    </Button>
  </Inline>
);

const meta = {
  title: "Patterns/Toast",
  component: Toasts,
  parameters: { controls: { disable: true } },
  render: () => <Triggers />,
} satisfies Meta<typeof Toasts>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A plain success leaves after four seconds. Undo, a recovery, or a failure stays until the
 * person acts or dismisses it.
 */
export const Outcomes: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove criterion" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save with a failed refresh" }));

    await waitFor(() =>
      expect(page.getByRole("alertdialog", { name: "Recommendation saved" })).toBeVisible(),
    );
    const recovery = page.getByRole("alertdialog", {
      name: "Saved, but the latest round could not be loaded.",
    });
    await waitFor(() =>
      expect(within(recovery).getByRole("button", { name: "Refresh" })).toBeVisible(),
    );
    await expect(within(recovery).getByRole("button", { name: "Close" })).toBeVisible();
  },
};

export const Failure: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Copy address" }));

    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("alertdialog", {
          name: "The address could not be copied.",
        }),
      ).toBeVisible(),
    );
  },
};

/** Toasts center over the page content, beside the sidebar. */
export const InWorkspace: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}
      >
        <section
          aria-label="Story controls"
          style={{
            padding: "var(--space-2) var(--space-4)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Story />
        </section>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <ApplicationShell
            brand="Merit"
            contextLabel="Alder Foundation"
            openNavigationLabel="Open navigation"
            closeNavigationLabel="Close navigation"
            navigation={<a href="#main">Funding rounds</a>}
            navigationLabel="Main navigation"
            skipLabel="Skip to content"
          >
            <ApplicationPage
              width="full"
              locationKey="toast"
              breadcrumb={null}
              breadcrumbLabel="Breadcrumb"
            >
              <Stack gap={4}>
                <PageHeader title="Local Connections" />
              </Stack>
            </ApplicationPage>
          </ApplicationShell>
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Remove criterion" }));

    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("alertdialog", {
          name: "Criterion removed",
        }),
      ).toBeVisible(),
    );
  },
};
