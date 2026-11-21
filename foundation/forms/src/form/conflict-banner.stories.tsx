import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";

import { MessagesProvider } from "@merit/i18n";
import { Button } from "@merit/ui/button";
import { Inline, Reading, Stack } from "@merit/ui/layout";

import { ConflictBanner, RetainedDraftNotice } from "./conflict-banner";

const meta = {
  title: "Patterns/Conflict Recovery",
  component: ConflictBanner,
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
    attribution: "Updated by Alex · 2m ago",
    keepMine: { label: "Save my changes over latest", onPress: () => {} },
    useSaved: { label: "Discard & load latest", onPress: () => {} },
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
          keepMine={{ label: "Save my changes over latest", onPress: () => resolve("kept") }}
          useSaved={{ label: "Discard & load latest", onPress: () => resolve("loaded") }}
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
    keepMine: { label: "Reaffirm draft for v2", onPress: () => {} },
    useSaved: { label: "Discard & load saved", onPress: () => {} },
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
          keepMine={{ label: "Reaffirm draft for v2", onPress: () => resolve("kept") }}
          useSaved={{ label: "Discard & load saved", onPress: () => resolve("loaded") }}
        />
      )}
    />
  ),
};

export const RetainedDraft: StoryObj = {
  render: () => <RetainedDraftExample />,
};
