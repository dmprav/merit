import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { expect, within } from "storybook/test";

import { Button } from "../../components/button/button";
import { Stack } from "../../components/layout/layout";
import { ApplicationPage, ApplicationStage } from "../application-shell/application-shell";
import { PageHeader } from "../page-header/page-header";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
  useReferenceViewport,
} from "./reference-workspace";

const Frame = ({ children }: { children: ReactNode }) => (
  <ApplicationStage>
    <ApplicationPage
      contained
      locationKey="reference-workspace"
      breadcrumb={null}
      breadcrumbLabel="Breadcrumb"
    >
      {children}
    </ApplicationPage>
  </ApplicationStage>
);

const header = (
  <PageHeader
    density="compact"
    title="Neighbour Table"
    description="Neighbourhood Kitchen, version 3 submitted 4 March"
  />
);

const paragraphs = (topic: string, count: number) =>
  Array.from({ length: count }, (_, index) => (
    <p key={index}>
      {topic} paragraph {index + 1}. Long reference text scrolls in its own pane while the work
      beside it stays in place, so reading never moves the fields or their actions.
    </p>
  ));

type Reference = "submission" | "criteria";

const AssessmentPane = () => {
  const [saved, setSaved] = useState(false);
  return (
    <WorkPane
      as="section"
      label="Your assessment"
      title="Your assessment"
      footer={
        <>
          <p role="status">{saved ? "Saved" : "Not saved"}</p>
          <Button onPress={() => setSaved(true)}>Save assessment</Button>
        </>
      }
    >
      <Stack>{paragraphs("Assessment note", 10)}</Stack>
    </WorkPane>
  );
};

const Example = () => {
  const { reference, referenceViewport, moveReference } =
    useReferenceViewport<Reference>("submission");
  const labels: Record<Reference, string> = {
    submission: "Applicant submission",
    criteria: "Assessment criteria",
  };
  return (
    <ReferenceWorkspace
      header={header}
      toWorkLabel="Go to your assessment"
      toReferenceLabel="Browse reference material"
    >
      <ReferencePane
        label="Reference"
        viewportRef={referenceViewport}
        toolbar={
          <ReferenceSwitcher
            label="Reference"
            triggerLabel={`Reference material: ${labels[reference]}`}
            options={labels}
            selected={reference}
            onChange={(next) => moveReference(next)}
          />
        }
      >
        <Stack as="section" aria-label={labels.submission} hidden={reference !== "submission"}>
          <h2>{labels.submission}</h2>
          {paragraphs("Submission", 14)}
        </Stack>
        <Stack as="section" aria-label={labels.criteria} hidden={reference !== "criteria"}>
          <h2>{labels.criteria}</h2>
          {paragraphs("Criterion", 4)}
        </Stack>
      </ReferencePane>
      <AssessmentPane />
    </ReferenceWorkspace>
  );
};

const meta = {
  title: "Patterns/Reference workspace",
  component: ReferenceWorkspace,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { children: null },
  argTypes: { children: { control: false }, header: { control: false } },
} satisfies Meta<typeof ReferenceWorkspace>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Reference material beside work with a persistent footer; each pane scrolls on its own. */
export const WorkBesideReference: Story = {
  render: () => (
    <Frame>
      <Example />
    </Frame>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Reference material: Applicant submission" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Assessment criteria",
      }),
    );
    await expect(canvas.getByRole("region", { name: "Assessment criteria" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save assessment" })).toBeVisible();
  },
};

/** Without reference material, such as when nothing has been submitted yet, the work takes the full width. */
export const WorkOnly: Story = {
  render: () => (
    <Frame>
      <ReferenceWorkspace header={header}>
        <AssessmentPane />
      </ReferenceWorkspace>
    </Frame>
  ),
};
