import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Button } from "../../components/button/button";
import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/description-list/description-list";
import { Icon } from "../../components/icon/icon";
import { Reading } from "../../components/layout/layout";
import { JudgmentChoice } from "../judgment/judgment";
import { PersonIdentity } from "../person-identity/person-identity";
import { PanelSection, PanelSections } from "./panel-section";
import styles from "./panel-section.stories.module.css";

const meta = {
  title: "Patterns/Panel section",
  component: PanelSection,
  subcomponents: { PanelSections },
  tags: ["!autodocs"],
  args: { title: "Application details" },
  decorators: [
    (Story) => (
      <div className={styles.panel}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PanelSection>;

export default meta;

type Story = StoryObj<typeof meta>;

const onChooseJudgment = fn();

export const SidePanel: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <PanelSections>
      <PanelSection
        title="Application details"
        actions={
          <Button variant="quiet" iconOnly aria-label="Edit application details">
            <Icon name="edit" />
          </Button>
        }
      >
        <DescriptionList layout="rows">
          <DescriptionListItem label="Applicant">Saturday Repair Collective</DescriptionListItem>
          <DescriptionListItem label="Applicant contact">
            <PersonIdentity name="Maya Thompson" />
          </DescriptionListItem>
          <DescriptionListItem label="Requested amount">€22,000</DescriptionListItem>
        </DescriptionList>
      </PanelSection>
      <PanelSection title="Staff summary">
        <Reading as="p" prose={false}>
          12 group repair workshops, with 27 expressions of interest.
        </Reading>
      </PanelSection>
      <PanelSection
        title="Review"
        count={2}
        meta="1 outdated review, 1 awaiting review"
        actions={
          <>
            <Button variant="quiet">
              <Icon name="add" />
              Add
            </Button>
            <Button variant="quiet">All assessments</Button>
          </>
        }
      >
        {/* A feature lets choices run to the edges so their avatars line up with the label. */}
        <div className={styles.choices}>
          <JudgmentChoice
            author="Sam Morgan"
            onPress={onChooseJudgment}
            summary={
              <>
                <strong>Fund</strong>
                <span>Proposed amount: €18,000</span>
              </>
            }
            basis={<span>Based on an earlier submission</span>}
          />
        </div>
      </PanelSection>
    </PanelSections>
  ),
  play: async ({ canvas }) => {
    const details = canvas.getByRole("region", { name: "Application details" });
    const review = canvas.getByRole("region", { name: /Review/ });
    await expect(review).toHaveTextContent("1 outdated review, 1 awaiting review");
    // Headings line up at the start of the panel, whether or not their section has actions.
    const label = canvas.getByRole("heading", { name: "Application details" });
    const value = canvas.getByText("Applicant");
    await expect(label.getBoundingClientRect().left).toBe(value.getBoundingClientRect().left);
    // Header rows keep one height, so the space between sections stays equal.
    const summary = canvas.getByRole("heading", { name: "Staff summary" });
    await expect(summary.parentElement!.getBoundingClientRect().height).toBe(
      label.parentElement!.getBoundingClientRect().height,
    );
    await expect(details).toBeVisible();
  },
};
