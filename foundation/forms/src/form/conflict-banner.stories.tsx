import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { fn } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";
import { Button } from "@merit/ui/button";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { TextField } from "@merit/ui/text-field";

import { ConflictBanner, RetainedDraftNotice, SavedValue } from "./conflict-banner";

const meta = {
  title: "Patterns/Conflict recovery",
  component: ConflictBanner,
  subcomponents: { RetainedDraftNotice, SavedValue },
  argTypes: {
    keepMine: { control: false },
    useSaved: { control: false },
    latest: { control: false },
  },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Reading prose={false}>
          <Story />
        </Reading>
      </MessagesProvider>
    ),
  ],
} satisfies Meta<typeof ConflictBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

const InteractiveExample = ({
  resolvedText,
  renderActive,
}: {
  resolvedText: { kept: string; loaded: string };
  renderActive: (resolve: (outcome: "kept" | "loaded") => void) => ReactNode;
}) => {
  const [outcome, setOutcome] = useState<"kept" | "loaded" | null>(null);
  return (
    <Stack gap={4}>
      {outcome ? (
        <p role="status">{resolvedText[outcome]}</p>
      ) : (
        renderActive((choice) => setOutcome(choice))
      )}
      {outcome && (
        <Inline>
          <Button variant="secondary" onPress={() => setOutcome(null)}>
            Reset example
          </Button>
        </Inline>
      )}
    </Stack>
  );
};

const RetainedDraftExample = () => {
  const [discarded, setDiscarded] = useState(false);
  return (
    <Stack gap={4}>
      {discarded ? (
        <p role="status">Retained draft discarded.</p>
      ) : (
        <RetainedDraftNotice
          title="Unsaved assessment"
          message="Your access ended before this draft could save. Copy your text to keep it."
          textToCopy="Strong community leadership and a practical local delivery plan."
          onDiscard={() => setDiscarded(true)}
        >
          <p>Strong community leadership and a practical local delivery plan.</p>
        </RetainedDraftNotice>
      )}
      {discarded && (
        <Inline>
          <Button variant="secondary" onPress={() => setDiscarded(false)}>
            Reset example
          </Button>
        </Inline>
      )}
    </Stack>
  );
};

export const SaveConflict: Story = {
  args: {
    title: "This round changed while you were editing",
    message: "Review the latest saved wording or save your edits over it.",
    attribution: "Updated by Alex, 2m ago",
    keepMine: { label: "Save my changes over latest", onPress: fn() },
    useSaved: { label: "Discard & load latest", onPress: fn() },
  },
  render: (args) => (
    <InteractiveExample
      resolvedText={{
        kept: "Draft kept and rebased onto the latest revision.",
        loaded: "Draft discarded and latest saved wording loaded.",
      }}
      renderActive={(resolve) => (
        <ConflictBanner
          title={args.title}
          message={args.message}
          attribution={args.attribution}
          keepMine={
            args.keepMine && {
              label: args.keepMine.label,
              onPress: () => {
                args.keepMine?.onPress();
                resolve("kept");
              },
            }
          }
          useSaved={
            args.useSaved && {
              label: args.useSaved.label,
              onPress: () => {
                args.useSaved?.onPress();
                resolve("loaded");
              },
            }
          }
          latest={{
            toggleLabel: "View latest",
            hideLabel: "Hide latest",
            heading: "Latest saved purpose",
            children: <p>Support local arts and community gathering places across the region.</p>,
          }}
        />
      )}
    />
  ),
};

export const BasisShift: Story = {
  args: {
    title: "Submission updated to version 2",
    message: "The application material changed while you were drafting this recommendation.",
    keepMine: { label: "Reaffirm draft for v2", onPress: fn() },
    useSaved: { label: "Discard & load saved", onPress: fn() },
  },
  render: (args) => (
    <InteractiveExample
      resolvedText={{
        kept: "Draft reaffirmed for submission version 2.",
        loaded: "Draft discarded and latest saved recommendation loaded.",
      }}
      renderActive={(resolve) => (
        <ConflictBanner
          title={args.title}
          message={args.message}
          keepMine={
            args.keepMine && {
              label: args.keepMine.label,
              onPress: () => {
                args.keepMine?.onPress();
                resolve("kept");
              },
            }
          }
          useSaved={
            args.useSaved && {
              label: args.useSaved.label,
              onPress: () => {
                args.useSaved?.onPress();
                resolve("loaded");
              },
            }
          }
        />
      )}
    />
  ),
};

export const SavedFieldComparison: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <TextField label="Project title" defaultValue="Workshop Saturdays (revised)" />
      <SavedValue label="Latest saved value">Workshop Saturdays</SavedValue>
    </Stack>
  ),
};

export const RetainedDraft: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => <RetainedDraftExample />,
};
