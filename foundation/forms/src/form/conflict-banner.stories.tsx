import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";
import { Reading } from "@merit/ui/layout";

import { ConflictBanner, RetainedDraftNotice } from "./conflict-banner";

const meta = {
  title: "Patterns/Conflict Recovery",
  component: ConflictBanner,
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <Reading>
          <Story />
        </Reading>
      </MessagesProvider>
    ),
  ],
} satisfies Meta<typeof ConflictBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SaveConflict: Story = {
  args: {
    title: "This round changed while you were editing",
    message: "Review the latest saved wording or save your edits over it.",
    attribution: "Updated by Alex · 2m ago",
    keepMine: { label: "Save my changes over latest", onPress: fn() },
    useSaved: { label: "Discard & load latest", onPress: fn() },
    latest: {
      toggleLabel: "View latest",
      hideLabel: "Hide latest",
      heading: "Latest saved purpose",
      children: <p>Support local arts and community gathering places across the region.</p>,
    },
  },
};

export const BasisShift: Story = {
  args: {
    title: "Submission updated to version 2",
    message: "The application material changed while you were drafting this recommendation.",
    keepMine: { label: "Reaffirm draft for v2", onPress: fn() },
    useSaved: { label: "Discard & load saved", onPress: fn() },
  },
};

export const RetainedDraft: StoryObj = {
  render: () => (
    <RetainedDraftNotice
      title="Unsaved assessment"
      message="Your access ended before this draft could save. Copy your text to keep it."
      textToCopy="Strong community leadership and a practical local delivery plan."
      onDiscard={fn()}
    >
      <p>Strong community leadership and a practical local delivery plan.</p>
    </RetainedDraftNotice>
  ),
};
