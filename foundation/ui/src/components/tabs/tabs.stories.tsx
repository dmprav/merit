import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { expect, fn, mocked, waitFor } from "storybook/test";

import { Button } from "../button/button";
import { Tabs } from "./tabs";
import localStyles from "./tabs.stories.module.css";

const items = [
  { id: "evidence", label: "Evidence", content: <p>Versioned application evidence.</p> },
  { id: "reviews", label: "Reviews", content: <p>Submitted reviewer assessments.</p> },
  { id: "decision", label: "Decision", content: <p>Recorded decision.</p>, isDisabled: true },
] as const;
const scrollLabels = {
  scrollBackwardLabel: "Scroll to earlier tabs",
  scrollForwardLabel: "Scroll to later tabs",
};
const overflowItems = [
  { id: "evidence", label: "Application evidence", content: <p>Versioned source passages.</p> },
  { id: "reviews", label: "Reviewer assessments", content: <p>Submitted assessments.</p> },
  { id: "decision", label: "Committee decision", content: <p>Recorded decision.</p> },
];

const meta = {
  title: "Components/Tabs",
  component: Tabs,
  args: { label: "Application sections", items, ...scrollLabels, onSelectionChange: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Tabs keep their supplied order. Supply an optional numeric count separately from the label; zero is shown, and counts are included in accessible names. Features decide what is counted. A countWarning gives the badge an amber treatment and supplies its hover explanation and the tab's accessible description; keep the underlying status visible in the panel too. When the row overflows, scroll controls reveal neighboring tabs without selecting them. Left/Right moves between tabs; Tab continues through the scroll controls to the panel. Labels may wrap within an individual tab at narrow widths, while each count stays together.",
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

const expectTabVisible = (tab: HTMLElement, viewport: HTMLElement) =>
  waitFor(async () => {
    const bounds = tab.getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();

    // Fractional scroll offsets can leave an edge within revealTab's one-pixel tolerance.
    await expect(bounds.left).toBeGreaterThanOrEqual(visible.left - 1);
    await expect(bounds.right).toBeLessThanOrEqual(visible.right + 1);
  });

export const Default: Story = {};
export const Focused: Story = {
  play: async ({ canvas, userEvent, args, step }) => {
    const evidence = canvas.getByRole("tab", { name: "Evidence" });
    await step("Keyboard navigation skips disabled tabs", async () => {
      evidence.focus();
      await userEvent.keyboard("{ArrowRight}");
      const reviews = canvas.getByRole("tab", { name: "Reviews" });

      await expect(reviews).toHaveFocus();
      await expect(reviews).toHaveAttribute("aria-selected", "true");
      await expect(canvas.getByRole("tabpanel", { name: "Reviews" })).toBeVisible();
      await expect(args.onSelectionChange).toHaveBeenCalledWith("reviews");
      await expect(canvas.getByRole("tab", { name: "Decision" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      await userEvent.keyboard("{ArrowRight}");

      await expect(evidence).toHaveFocus();
      await expect(evidence).toHaveAttribute("aria-selected", "true");
    });
    await step("Tab reaches the panel and Shift+Tab returns to the tab focus cue", async () => {
      await userEvent.tab();
      const panel = canvas.getByRole("tabpanel", { name: "Evidence" });

      await expect(panel).toHaveFocus();
      await expect(panel).toHaveAttribute("data-focus-visible", "true");
      await expect(panel).toHaveStyle({ outlineStyle: "none" });
      await expect(getComputedStyle(panel).boxShadow).not.toBe("none");

      await userEvent.tab({ shift: true });

      await expect(evidence).toHaveFocus();
      await expect(evidence).toHaveAttribute("data-focus-visible", "true");
    });
  },
};

const ResizableTabs = (args: ComponentProps<typeof Tabs>) => {
  const [width, setWidth] = useState(280);

  return (
    <>
      <label className={localStyles.resizeControl}>
        Available width
        <input
          type="range"
          min="240"
          max="640"
          step="10"
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <span>{width}px</span>
      </label>
      <div data-testid="tabs-container" style={{ width, maxWidth: "100%" }}>
        <Tabs {...args} />
      </div>
    </>
  );
};

export const Overflow: Story = {
  args: { items: overflowItems },
  render: (args) => <ResizableTabs {...args} />,
};
export const LongLabel: Story = {
  args: {
    items: [
      {
        id: "evidence",
        label: "Application evidence and supporting financial documentation",
        content: <p>Complete labels remain readable at narrow widths.</p>,
      },
      ...overflowItems.slice(1),
    ],
  },
  decorators: [
    (Story) => (
      <div className={localStyles.narrow}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const tab = canvas.getByRole("tab", {
      name: "Application evidence and supporting financial documentation",
    });
    await expectTabVisible(tab, canvas.getByRole("tablist"));

    await expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth);
  },
};
export const RightToLeft: Story = {
  args: { items: overflowItems },
  decorators: [
    (Story) => (
      <I18nProvider locale="ar">
        <div dir="rtl" className={localStyles.narrow}>
          <Story />
        </div>
      </I18nProvider>
    ),
  ],
};

export const Counts: Story = {
  args: {
    items: [
      {
        id: "applications",
        label: "Applications awaiting assessment",
        count: 12345,
        countWarning: "Some applications need attention",
        content: <p>Applications awaiting assessment.</p>,
      },
      { id: "reviews", label: "Reviews", count: 0, content: <p>No reviews yet.</p> },
      { id: "decisions", label: "Decisions", count: 4, isDisabled: true, content: null },
    ],
  },
  render: (args) => <ResizableTabs {...args} />,
  play: async ({ canvas, userEvent }) => {
    const viewport = canvas.getByRole("tablist");
    const applications = canvas.getByRole("tab", {
      name: "Applications awaiting assessment 12345",
    });
    await expectTabVisible(applications, viewport);

    await expect(applications).toHaveAccessibleDescription("Some applications need attention");

    const count = canvas.getByText("12345");

    await expect(count).toHaveAttribute("title", "Some applications need attention");
    await expect(count.scrollWidth).toBeLessThanOrEqual(count.clientWidth);
    await expect(count).toHaveStyle({ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" });

    applications.focus();
    await userEvent.keyboard(
      getComputedStyle(viewport).direction === "rtl" ? "{ArrowLeft}" : "{ArrowRight}",
    );
    const reviews = canvas.getByRole("tab", { name: "Reviews 0" });

    await expect(reviews).toHaveFocus();

    await expectTabVisible(reviews, viewport);

    await expect(canvas.getByRole("tabpanel", { name: "Reviews 0" })).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "Decisions 4" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};
export const CountsRightToLeft: Story = {
  ...Counts,
  decorators: RightToLeft.decorators,
};

const ControlledTabs = () => {
  const [selectedKey, setSelectedKey] = useState("reviews");

  return (
    <>
      <p className={localStyles.status}>Selected section: {selectedKey}</p>
      <Tabs
        label="Application sections"
        {...scrollLabels}
        items={items}
        selectedKey={selectedKey}
        onSelectionChange={setSelectedKey}
      />
    </>
  );
};

export const Controlled: Story = {
  render: () => <ControlledTabs />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("tabpanel", { name: "Reviews" })).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Evidence" }));

    await expect(canvas.getByText("Selected section: evidence")).toBeVisible();
    await expect(canvas.getByRole("tabpanel", { name: "Evidence" })).toBeVisible();
  },
};

export const OverflowInteractions: Story = {
  ...Overflow,
  args: { items: overflowItems, defaultSelectedKey: "decision" },
  play: async ({ canvas, userEvent, args, step }) => {
    const viewport = canvas.getByRole("tablist");
    const evidence = canvas.getByRole("tab", { name: "Application evidence" });
    const reviews = canvas.getByRole("tab", { name: "Reviewer assessments" });
    const decision = canvas.getByRole("tab", { name: "Committee decision" });
    const forward = await canvas.findByRole("button", { name: scrollLabels.scrollForwardLabel });
    const backward = canvas.getByRole("button", { name: scrollLabels.scrollBackwardLabel });

    await step("Initial selection at the end is revealed", async () => {
      await expect(decision).toHaveAttribute("aria-selected", "true");

      await expectTabVisible(decision, viewport);
      decision.focus();
      await userEvent.keyboard("{Home}");

      await expect(evidence).toHaveFocus();

      await expectTabVisible(evidence, viewport);
    });
    await step("Arrows scroll without selecting and retain focus at the boundary", async () => {
      mocked(args.onSelectionChange!).mockClear();

      // Scroll events update the arrow state after keyboard navigation moves the strip.
      await waitFor(() => expect(forward).toHaveAttribute("aria-disabled", "false"));

      await userEvent.click(forward);
      await expectTabVisible(reviews, viewport);
      await userEvent.click(forward);

      await waitFor(() => expect(forward).toHaveAttribute("aria-disabled", "true"));
      await expect(forward).toHaveFocus();
      await expect(evidence).toHaveAttribute("aria-selected", "true");
      await expect(args.onSelectionChange).not.toHaveBeenCalled();
    });
    await step("Returning from the arrows reveals the selected tab", async () => {
      await userEvent.tab({ shift: true });
      await userEvent.tab({ shift: true });

      await expect(evidence).toHaveFocus();
      await expect(evidence).toHaveAttribute("aria-selected", "true");

      await expectTabVisible(evidence, viewport);
    });
    await step("Pointer selection reveals a clipped tab", async () => {
      await userEvent.click(reviews);

      await expect(reviews).toHaveFocus();
      await expect(reviews).toHaveAttribute("aria-selected", "true");

      await expectTabVisible(reviews, viewport);
    });
    await step("Keyboard navigation reveals the last tab", async () => {
      await userEvent.keyboard(
        getComputedStyle(viewport).direction === "rtl" ? "{ArrowLeft}" : "{ArrowRight}",
      );

      await expect(decision).toHaveFocus();
      await expect(decision).toHaveAttribute("aria-selected", "true");

      await expectTabVisible(decision, viewport);
    });
    await step("Resizing preserves focus as scroll controls appear or disappear", async () => {
      await userEvent.click(backward);

      await expect(backward).toHaveFocus();

      const sized = canvas.getByTestId("tabs-container");
      sized.style.width = "640px";

      await waitFor(async () => {
        // A narrow preview cannot expand far enough to fit every tab.
        if (sized.getBoundingClientRect().width < 640) {
          await expect(backward).toBeVisible();
          await expect(backward).toHaveFocus();
        } else {
          await expect(
            canvas.queryByRole("button", { name: scrollLabels.scrollForwardLabel }),
          ).not.toBeInTheDocument();
          await expect(decision).toHaveFocus();
        }
      });

      await expectTabVisible(decision, viewport);
      sized.style.width = "280px";
      await canvas.findByRole("button", { name: scrollLabels.scrollForwardLabel });
      await expectTabVisible(decision, viewport);
    });

    await expect(canvas.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
      overflowItems.map((item) => item.label),
    );
  },
};

export const OverflowInteractionsRightToLeft: Story = {
  ...OverflowInteractions,
  decorators: [
    (Story) => (
      <I18nProvider locale="ar">
        <div dir="rtl">
          <Story />
        </div>
      </I18nProvider>
    ),
  ],
};

export const WithAction: Story = {
  args: {
    items: [{ ...items[0], count: 12 }, { ...items[1], count: 3 }, items[2]],
    actions: (
      <Button size="small" variant="secondary">
        Add application
      </Button>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("tab", { name: "Evidence 12" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    await expect(canvas.getByRole("tab", { name: "Reviews 3" })).toHaveFocus();

    await userEvent.tab();
    const backward = canvas.queryByRole("button", { name: scrollLabels.scrollBackwardLabel });
    if (backward) {
      await expect(backward).toHaveFocus();
      await userEvent.tab();
      await expect(
        canvas.getByRole("button", { name: scrollLabels.scrollForwardLabel }),
      ).toHaveFocus();
      await userEvent.tab();
    }

    await expect(canvas.getByRole("button", { name: "Add application" })).toHaveFocus();
  },
};
