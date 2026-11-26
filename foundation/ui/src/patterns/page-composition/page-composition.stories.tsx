import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { ActionMenu } from "../../components/action-menu/action-menu";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/description-list/description-list";
import { Icon } from "../../components/icon/icon";
import { Reading, Stack } from "../../components/layout/layout";
import { Notice } from "../../components/notice/notice";
import { ApplicationPage } from "../application-shell/application-shell";
import { ConfirmationDialog } from "../confirmation-dialog/confirmation-dialog";
import { PageHeader } from "../page-header/page-header";
import { SectionHeader } from "../section-header/section-header";
import styles from "./page-composition.stories.module.css";
import { PropertiesLayout } from "./properties-layout";

type PageLayoutArgs = {
  width?: "standard" | "full";
  density?: "comfortable" | "compact";
  title?: string;
  stackedPlacement?: "before" | "after";
};

type PageCompositionStoryArgs = React.ComponentProps<typeof PageHeader> &
  Omit<PageLayoutArgs, "title">;

const meta = {
  title: "Patterns/Page composition",
  component: PageHeader,
  subcomponents: { SectionHeader, PropertiesLayout },
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
  args: { title: "Local Connections" },
  render: () => (
    <div className={styles.preview}>
      <PageHeader
        title="Local Connections"
        status={<Badge>Decisions pending</Badge>}
        kicker="Funding round"
        description="Prepare the evidence and recommendations for committee."
        actions={<Button variant="secondary">Review round</Button>}
      />
      <section aria-labelledby="applications-title">
        <SectionHeader
          id="applications-title"
          title="Applications"
          count={0}
          aside={<Badge tone="neutral">In preparation</Badge>}
        />
        <p className={styles.description}>
          Applications will appear here when they are ready to review.
        </p>
      </section>
      <div className={styles.notice}>
        <Notice tone="warning">Confirm the revised budget before making a recommendation.</Notice>
      </div>
    </div>
  ),
} satisfies Meta<PageCompositionStoryArgs>;

export default meta;

type Story = StoryObj<PageCompositionStoryArgs>;

export const Overview: Story = {};

export const SectionHeaders: Story = {
  render: () => (
    <div className={styles.preview}>
      <PageHeader title="Section headers" />
      <section className={styles.section} aria-labelledby="purpose-title">
        <SectionHeader id="purpose-title" title="Purpose" />
        <p className={styles.description}>Support projects that bring neighbours together.</p>
      </section>
      <section className={styles.section} aria-labelledby="applications-title">
        <SectionHeader id="applications-title" title="Applications" count={3} />
        <p className={styles.description}>Compare the applications in this round.</p>
      </section>
      <section className={styles.section} aria-labelledby="reviews-title">
        <SectionHeader
          id="reviews-title"
          title="Reviewer assessments"
          aside={<span className={styles.description}>2 submitted</span>}
        />
        <p className={styles.description}>
          Keep qualified counts outside the heading so their meaning stays clear.
        </p>
      </section>
      <section
        className={`${styles.section} ${styles.narrow}`}
        aria-labelledby="recommendation-title"
      >
        <SectionHeader
          id="recommendation-title"
          title="Manager recommendation for Local Connections 2027"
          aside={<Button variant="secondary">Edit recommendation</Button>}
        />
        <p className={styles.description}>Long headings and actions wrap within a narrow pane.</p>
      </section>
    </div>
  ),
};

export const SectionHeaderQuietActions: Story = {
  render: () => (
    <div className={styles.preview}>
      <section className={styles.section} aria-labelledby="contacts-title">
        <SectionHeader
          id="contacts-title"
          title="Contacts"
          aside={<Button variant="quiet">View all</Button>}
        />
        <p className={styles.description}>A trailing quiet text action ends on the content edge.</p>
      </section>
      <section className={styles.section} aria-labelledby="notes-title">
        <SectionHeader
          id="notes-title"
          title="Notes"
          aside={
            <Button variant="quiet" iconOnly aria-label="Edit notes">
              <Icon name="edit" />
            </Button>
          }
        />
        <p className={styles.description}>
          A trailing icon action ends with its glyph on the edge.
        </p>
      </section>
    </div>
  ),
};

const renderPageLayout = ({
  width = "standard",
  density = "comfortable",
  title = "Local Connections",
}: PageCompositionStoryArgs) => (
  <ApplicationPage
    width={width}
    locationKey="round"
    breadcrumb={[
      <a key="rounds" href="#purpose">
        Funding rounds
      </a>,
      title,
    ]}
    breadcrumbLabel="Breadcrumb"
  >
    <PageHeader
      title={title}
      density={density}
      kicker="Funding round"
      status={<Badge>In preparation</Badge>}
      description="Prepare the evidence and recommendations for committee."
      actions={
        <>
          <Button variant="secondary">Review round</Button>
          <ActionMenu
            label="More actions"
            trigger={
              <Button variant="quiet" iconOnly aria-label="More actions">
                <Icon name="more" />
              </Button>
            }
            items={[{ id: "export", label: "Export summary", icon: "arrow" }]}
            onAction={fn()}
          />
        </>
      }
    />
    <Stack gap={7}>
      <section aria-labelledby="purpose">
        <SectionHeader id="purpose" title="Purpose" />
        <Reading as="p">
          Support local projects that bring neighbours together and make community spaces more
          accessible. Read each proposal alongside its supporting evidence before preparing a
          recommendation, keeping the applicant’s account distinct from reviewer judgments.
        </Reading>
      </section>
      <section aria-labelledby="applications">
        <SectionHeader id="applications" title="Applications" count={3} />
        <Notice tone="warning">
          One application has changed since review. Compare the revised evidence before recording a
          recommendation.
        </Notice>
      </section>
    </Stack>
  </ApplicationPage>
);

const pageLayoutStory = (args: PageLayoutArgs): Story => ({
  parameters: { layout: "fullscreen", controls: { disable: false } },
  args: { width: "standard", density: "comfortable", title: "Local Connections", ...args },
  argTypes: {
    width: { control: "radio", options: ["standard", "full"] },
    density: { control: "radio", options: ["comfortable", "compact"] },
    stackedPlacement: { control: false },
  },
  render: renderPageLayout,
});

export const Standard: Story = pageLayoutStory({});
export const FullWidth: Story = pageLayoutStory({ width: "full" });
export const Compact: Story = pageLayoutStory({ density: "compact" });
export const LongTitle: Story = pageLayoutStory({
  title: "Community partnerships for arts, education and neighbourhood development",
});

const renderPropertiesLayout = ({ stackedPlacement = "before" }: PageCompositionStoryArgs) => (
  <PropertiesLayout
    propertiesLabel="Round properties"
    stackedPlacement={stackedPlacement}
    properties={
      <DescriptionList layout="rows">
        <DescriptionListItem label="Budget">£120,000</DescriptionListItem>
        <DescriptionListItem label="Committee">14 March 2027</DescriptionListItem>
      </DescriptionList>
    }
  >
    <Reading as="p">
      Support local projects that bring neighbours together and make community spaces more
      accessible.
    </Reading>
  </PropertiesLayout>
);

export const PropertiesFirstWhenStacked: Story = {
  render: renderPropertiesLayout,
  play: async ({ canvas }) => {
    const panel = canvas.getByRole("complementary", { name: "Round properties" });
    await expect(panel.nextElementSibling).toHaveTextContent("Support local projects");
  },
};

export const PropertiesLastWhenStacked: Story = {
  args: { stackedPlacement: "after" },
  render: renderPropertiesLayout,
  play: async ({ canvas }) => {
    const panel = canvas.getByRole("complementary", { name: "Round properties" });
    await expect(panel.previousElementSibling).toHaveTextContent("Support local projects");
  },
};

const AwardAmendmentExample = () => {
  const [open, setOpen] = useState(false);
  const [approved, setApproved] = useState(false);

  return (
    <div className={styles.amendment}>
      <PageHeader
        title="Approve a venue change"
        kicker="Award amendment for Workshop Saturdays"
        status={<Badge>{approved ? "Amendment recorded" : "Awaiting decision"}</Badge>}
        description="Fictional design exploration of a future workflow; no award is changed."
      />
      <div className={styles.decisionLayout}>
        <article className={styles.reading} aria-labelledby="amendment-proposal">
          <SectionHeader id="amendment-proposal" title="The proposed amendment" />
          <p>
            The community centre can no longer provide a room free of charge. The team proposes
            moving all twelve workshops to an accessible venue nearby, with the same dates and group
            size. An additional €4,000 would cover the venue hire.
          </p>
          <section aria-labelledby="amendment-evidence">
            <SectionHeader id="amendment-evidence" title="Basis for the decision" />
            <blockquote>
              “The room is available on all twelve dates. Step-free access, accessible toilets, and
              storage are included in the quoted price.”
            </blockquote>
            <p className={styles.source}>
              Quote from Riverside Community Rooms, received 8 November
            </p>
          </section>
          <section aria-labelledby="amendment-reason">
            <SectionHeader id="amendment-reason" title="Reason for approval" />
            <p>
              The additional funding preserves the planned programme. The confirmed quote covers the
              full venue requirement, so the team can deliver the sessions without reducing capacity
              or changing the schedule.
            </p>
            <p className={styles.source}>Prepared by Dana Reed, program manager, on 9 November</p>
          </section>
        </article>
        <aside className={styles.consequences} aria-labelledby="amendment-effect">
          <SectionHeader id="amendment-effect" title="Effect of approval" />
          <DescriptionList>
            <DescriptionListItem label="Original award">€18,000</DescriptionListItem>
            <DescriptionListItem label="Additional commitment">€4,000</DescriptionListItem>
            <DescriptionListItem label="Revised award">€22,000</DescriptionListItem>
            <DescriptionListItem label="Round budget remaining after approval">
              €8,000
            </DescriptionListItem>
          </DescriptionList>
          <p className={styles.description}>
            Approval records the revised award and its reason. Applicant notification is a separate
            action. The original decision remains in the history.
          </p>
          <p role="status" className={styles.description}>
            {approved ? "Example amendment recorded. No real funding was committed." : null}
          </p>
          <ConfirmationDialog
            title="Approve the award amendment?"
            description="Increase the award from €18,000 to €22,000 for venue hire. This commits an additional €4,000 and leaves €8,000 available in the round."
            closeLabel="Close approval"
            cancelLabel="Keep reviewing"
            confirmLabel="Approve additional €4,000"
            isOpen={open}
            onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (isOpen) {
                setApproved(false);
              }
            }}
            onConfirm={() => {
              setApproved(true);
              setOpen(false);
            }}
            trigger={<Button>{approved ? "Review example again" : "Review approval"}</Button>}
          />
        </aside>
      </div>
    </div>
  );
};

export const AwardAmendment: Story = {
  render: () => <AwardAmendmentExample />,
  parameters: {
    docs: {
      description: {
        story:
          "A hypothetical post-award decision tests reading, provenance, financial consequences, and confirmation with shared components. It is not an available product workflow.",
      },
    },
  },
};
