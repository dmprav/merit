import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Icon } from "../icon/icon";
import { Button } from "./button";
import localStyles from "./button.stories.module.css";

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Save recommendation", onPress: fn() },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "quiet", "destructive", "inline"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

const variants = ["primary", "secondary", "quiet", "destructive"] as const;

const renderVariants: Story["render"] = (args) => (
  <div className={localStyles.variants}>
    {variants.map((variant) => (
      <div key={variant} className={localStyles.variant}>
        <p className={localStyles.description}>{variant}</p>
        <Button {...args} variant={variant} />
      </div>
    ))}
  </div>
);

export const Overview: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className={localStyles.variants}>
      {variants.map((variant) => {
        const label = variant === "destructive" ? "Revoke invitation" : "Save recommendation";

        return (
          <section key={variant} aria-label={variant} className={localStyles.variant}>
            <h2 className={localStyles.description}>{variant}</h2>
            <div>
              <Button variant={variant}>{label}</Button>
            </div>
            <div className={localStyles.actions}>
              <Button variant={variant}>
                <Icon name={variant === "destructive" ? "discard" : "add"} />
                {variant === "destructive" ? "Remove reviewer" : "Add reviewer"}
              </Button>
              <Button
                variant={variant}
                iconOnly
                aria-label={variant === "destructive" ? "Discard draft" : "More actions"}
              >
                <Icon name={variant === "destructive" ? "discard" : "more"} />
              </Button>
            </div>
            <div>
              <Button variant={variant} isPending>
                {variant === "destructive" ? "Revoking…" : "Saving…"}
              </Button>
            </div>
            <div>
              <Button variant={variant} isDisabled>
                {label}
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  ),
};

export const Playground: Story = {};
export const AlignedWithContent: Story = {
  args: {
    variant: "quiet",
    alignment: "start",
    children: (
      <>
        Review details
        <Icon name="right" />
      </>
    ),
  },
  argTypes: { children: { control: false } },
  render: (args) => (
    <section className={localStyles.variant}>
      <p>The reviewer supports the proposal with a revised amount.</p>
      <div>
        <Button {...args} />
      </div>
    </section>
  ),
};
export const AlignedAtEnd: Story = {
  args: { variant: "quiet", alignment: "end", children: "All assessments" },
  argTypes: { children: { control: false } },
  render: (args) => (
    <section className={localStyles.variant}>
      <p>A quiet action at the end of a row puts its text on the content's trailing edge.</p>
      <div className={localStyles.grid}>
        <Button {...args} />
      </div>
      <div className={localStyles.grid}>
        <Button {...args} size="large">
          Review all assessments
        </Button>
      </div>
      <div className={localStyles.grid}>
        <Button {...args} iconOnly aria-label="Edit">
          <Icon name="edit" />
        </Button>
      </div>
    </section>
  ),
};
export const IconAlignedAtStart: Story = {
  args: { variant: "quiet", alignment: "start", iconOnly: true },
  argTypes: { children: { control: false } },
  render: (args) => (
    <section className={localStyles.variant}>
      <p>An icon action at the start of a row puts its glyph on the content's leading edge.</p>
      <div className={localStyles.grid}>
        <Button {...args} aria-label="Edit">
          <Icon name="edit" />
        </Button>
      </div>
      <div className={localStyles.grid}>
        <Button {...args} size="large" aria-label="Edit large">
          <Icon name="edit" />
        </Button>
      </div>
    </section>
  ),
};
export const FillingWidth: Story = {
  args: { variant: "secondary", alignment: "fill" },
  parameters: {
    docs: {
      description: {
        story:
          "A choice in a list takes the full width and starts its label at the leading edge, so a long label wraps like text instead of centering.",
      },
    },
  },
  render: (args) => (
    <div className={`${localStyles.narrow} ${localStyles.stack}`}>
      <Button {...args}>Draft a question to the applicant about the venue</Button>
      <Button {...args}>What changed in version 2, and do the reviews cover it?</Button>
    </div>
  ),
};
export const InlineCommand: Story = {
  args: { variant: "inline", children: "request access" },
  parameters: {
    docs: {
      description: {
        story:
          "The inline variant presents a command within copy, such as opening a dialog, with the inline link's text treatment. Use Link for destinations.",
      },
    },
  },
  render: (args) => (
    <p>
      You are not a member of this workspace. You can <Button {...args} /> from its administrators.
    </p>
  ),
};
export const MutedSurface: Story = {
  args: { variant: "quiet", children: "Show details", "aria-expanded": false },
  parameters: {
    docs: {
      description: {
        story:
          "A muted surface supplies --button-quiet-background: var(--surface) so quiet actions stay visible on hover or while expanded. Button owns press, focus, and disabled states; keyboard focus takes precedence over hover and press.",
      },
    },
  },
  render: (args) => (
    <div className={localStyles.mutedSurface}>
      <Button {...args} />
    </div>
  ),
};
export const KeyboardFocus: Story = {
  name: "Keyboard focus",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className={localStyles.examples}>
      <p className={localStyles.description}>
        Press Tab or Shift+Tab to move between buttons. Hover a focused button to compare the
        states.
      </p>
      <div className={localStyles.actions}>
        {(
          [
            ["primary", "Save recommendation"],
            ["secondary", "Cancel"],
            ["quiet", "View details"],
            ["destructive", "Revoke invitation"],
          ] as const
        ).map(([variant, label]) => (
          <Button key={variant} variant={variant}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const buttons = canvas.getAllByRole("button");
    await userEvent.tab();
    buttons[0]!.focus();

    for (const [index, button] of buttons.entries()) {
      if (index > 0) {
        await userEvent.tab();
      }

      await expect(button).toHaveFocus();
      await expect(button).toHaveAttribute("data-focus-visible", "true");
    }

    for (let index = 1; index < buttons.length; index++) {
      await userEvent.tab({ shift: true });
    }

    await expect(buttons[0]).toHaveFocus();
  },
};
export const Large: Story = {
  args: { size: "large", children: "Explore the example" },
  argTypes: { variant: { control: false } },
  render: renderVariants,
};
export const Pending: Story = {
  args: { isPending: true, children: "Saving…" },
  argTypes: { variant: { control: false } },
  render: renderVariants,
  play: async ({ args, canvas, userEvent }) => {
    const buttons = canvas.getAllByRole("button", { name: "Saving…" });
    await userEvent.tab();
    buttons[0]!.focus();

    for (const [index, button] of buttons.entries()) {
      if (index > 0) {
        await userEvent.tab();
      }

      await expect(button).toHaveAttribute("data-pending", "true");
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await expect(button).toHaveFocus();

      await userEvent.keyboard("{Enter} ");
      await userEvent.click(button);

      await expect(button).toHaveFocus();
    }

    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

export const IconOnly: Story = {
  args: { iconOnly: true, "aria-label": "Close", children: <Icon name="close" /> },
  argTypes: { children: { control: false } },
};

export const PendingIconOnly: Story = {
  args: {
    iconOnly: true,
    isPending: true,
    "aria-label": "Save changes",
    children: <Icon name="check" />,
  },
  argTypes: { variant: { control: false }, children: { control: false } },
  render: renderVariants,
  play: async ({ args, canvas, userEvent }) => {
    const buttons = canvas.getAllByRole("button", { name: "Save changes" });
    await userEvent.tab();
    buttons[0]!.focus();

    for (const [index, button] of buttons.entries()) {
      if (index > 0) {
        await userEvent.tab();
      }

      await expect(button).toHaveFocus();
      await expect(button).toHaveAttribute("data-pending", "true");
      await expect(button.querySelectorAll("svg")).toHaveLength(1);
      await userEvent.keyboard("{Enter} ");
      await userEvent.click(button);
    }

    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

export const LongLabel: Story = {
  args: { children: "Save recommendation and return to the funding round" },
  render: (args) => (
    <div className={localStyles.narrow}>
      <Button {...args} />
    </div>
  ),
};
