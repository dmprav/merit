import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import type { ApplicationDocuments as Documents } from "@merit/applications/api";
import { ApplicationPage } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { PageHeader } from "@merit/ui/page-header";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
} from "@merit/ui/reference-workspace";

import type { ApplicationDocumentSession } from "../../contracts/documents";
import { Messages } from "../../messages";
import { ApplicationDocuments } from "./application-documents";
import styles from "./documents.module.css";

const recorder = { userId: "dana", name: "Dana Reed" };

const filled = (): Documents => ({
  proposal: {
    currentVersion: 2,
    versions: [
      {
        version: 2,
        filename: "Community-meals-proposal.pdf",
        pageCount: 12,
        byteSize: 240_000,
        recorder,
        recordedAt: "2027-03-02T15:04:00.000Z",
      },
      {
        version: 1,
        filename: "proposal-draft.pdf",
        pageCount: 9,
        byteSize: 180_000,
        recorder,
        recordedAt: "2027-02-11T09:30:00.000Z",
      },
    ],
    citations: [
      {
        id: "b8q3w5j7c2df",
        role: "proposal",
        version: 1,
        page: 4,
        note: "The weekly meal count is on this page.",
        recorder,
        recordedAt: "2027-02-12T11:00:00.000Z",
        currentVersion: 2,
      },
    ],
  },
  budget: {
    currentVersion: 1,
    versions: [
      {
        version: 1,
        filename: "Community-meals-budget.pdf",
        pageCount: 3,
        byteSize: 84_000,
        recorder,
        recordedAt: "2027-02-11T09:40:00.000Z",
      },
    ],
    citations: [],
  },
});

const idle: ApplicationDocumentSession = {
  readFile: async () => ({ status: "not_found" }),
};

const Frame = ({ children }: { children: ReactNode }) => (
  <Messages>
    <div className={`${shellStyles.shell} ${styles.stageOnly}`}>
      <div className={shellStyles.stage}>
        <ApplicationPage
          contained
          locationKey="documents"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
        >
          <ReferenceWorkspace
            header={
              <PageHeader
                density="compact"
                title="Community meals"
                description="Neighbourhood Kitchen"
              />
            }
            toWorkLabel="Go to reviews and application details"
            toReferenceLabel="Browse reference material"
          >
            <ReferencePane
              label="Reference"
              toolbar={
                <ReferenceSwitcher<"submission" | "documents" | "reviews" | "history" | "details">
                  label="Reference"
                  triggerLabel="Reference material: Documents"
                  options={{
                    submission: "Applicant submission",
                    documents: "Documents",
                    reviews: "Reviewer assessments",
                    history: "Version history",
                    details: "Application details",
                  }}
                  selected="documents"
                  onChange={() => {}}
                />
              }
            >
              {children}
            </ReferencePane>
            <WorkPane as="section" label="Application workspace" title="Overview">
              <p>Staff summary stays separate from submitted material.</p>
            </WorkPane>
          </ReferenceWorkspace>
        </ApplicationPage>
      </div>
    </div>
  </Messages>
);

const meta = {
  title: "Features/Applications/Source documents",
  component: ApplicationDocuments,
  parameters: { layout: "fullscreen" },
  decorators: [(story) => <Frame>{story()}</Frame>],
} satisfies Meta<typeof ApplicationDocuments>;

export default meta;

type Story = StoryObj<typeof meta>;

const empty: Documents = {
  proposal: { currentVersion: null, versions: [], citations: [] },
  budget: { currentVersion: null, versions: [], citations: [] },
};

export const Empty: Story = {
  args: { mode: "manage", canWrite: true, documents: empty, session: idle },
};

export const CitedEarlierVersion: Story = {
  args: { mode: "manage", canWrite: true, documents: filled(), session: idle },
};

export const Reader: Story = {
  args: {
    mode: "manage",
    canWrite: true,
    documents: filled(),
    session: idle,
    initialReader: {
      role: "proposal",
      version: 2,
      page: 6,
      filename: "Community-meals-proposal.pdf",
      pageCount: 12,
      bytes: new TextEncoder().encode("%PDF-1.4\n"),
    },
  },
};

export const UploadError: Story = {
  args: {
    mode: "manage",
    canWrite: true,
    documents: filled(),
    session: idle,
    initialNotice: "This file is not a PDF.",
  },
};

export const Withdrawn: Story = {
  args: { mode: "manage", canWrite: false, documents: filled(), session: idle },
};
