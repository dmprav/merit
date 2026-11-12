import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Reading, Stack } from "../../components/layout/layout";
import { Notice } from "../../components/notice/notice";
import { ApplicationPage } from "../application-shell/application-shell";
import { PageHeader } from "../page-header/page-header";
import { SectionHeader } from "../section-header/section-header";
import styles from "./page-layout.stories.module.css";

const meta = {
  title: "Patterns/Page composition",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    width: "standard",
    density: "comfortable",
    title: "Local Connections",
  },
  argTypes: {
    width: { control: "radio", options: ["standard", "full"] },
    density: { control: "radio", options: ["comfortable", "compact"] },
  },
  render: ({ width, density, title }) => (
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
            <Button variant="secondary">Export summary</Button>
            <Button>Review round</Button>
          </>
        }
      />
      <Stack gap={7}>
        <section aria-labelledby="purpose">
          <SectionHeader id="purpose" title="Purpose" />
          <Reading as="p" className={styles.prose}>
            Support local projects that bring neighbours together and make community spaces more
            accessible. Read each proposal alongside its supporting evidence before preparing a
            recommendation, keeping the applicant’s account distinct from reviewer judgments.
          </Reading>
        </section>
        <section aria-labelledby="applications">
          <SectionHeader id="applications" title="Applications" count={3} />
          <Notice tone="warning">
            One application has changed since review. Compare the revised evidence before recording
            a recommendation.
          </Notice>
        </section>
      </Stack>
    </ApplicationPage>
  ),
} satisfies Meta<{
  width: "standard" | "full";
  density: "comfortable" | "compact";
  title: string;
}>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const FullWidth: Story = { args: { width: "full" } };
export const Compact: Story = { args: { density: "compact" } };
export const LongTitle: Story = {
  args: { title: "Community partnerships for arts, education and neighbourhood development" },
};
