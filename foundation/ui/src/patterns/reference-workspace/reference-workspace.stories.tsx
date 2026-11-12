import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { expect, within } from "storybook/test";

import { Button } from "../../components/button/button";
import { Stack } from "../../components/layout/layout";
import { ApplicationPage, ApplicationShell } from "../application-shell/application-shell";
import { PageHeader } from "../page-header/page-header";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
  useReferenceViewport,
} from "./reference-workspace";

const Frame = ({ children }: { children: ReactNode }) => (
  <ApplicationShell
    brand="Merit"
    contextLabel="Example workspace"
    openNavigationLabel="Open navigation"
    closeNavigationLabel="Close navigation"
    navigation={
      <a href="#main" aria-current="page">
        Documents
      </a>
    }
    navigationLabel="Main navigation"
    skipLabel="Skip to content"
  >
    <ApplicationPage
      contained
      locationKey="reference-workspace"
      breadcrumb={["Documents", "Annual report"]}
      breadcrumbLabel="Breadcrumb"
    >
      {children}
    </ApplicationPage>
  </ApplicationShell>
);

const header = (
  <PageHeader density="compact" title="Annual report" description="Version 3 · Updated 4 March" />
);

const paragraphs = (topic: string, count: number) =>
  Array.from({ length: count }, (_, index) => (
    <p key={index}>
      {topic} paragraph {index + 1}. Long reference text scrolls in its own pane while the work
      beside it stays in place, so reading never moves the fields or their actions.
    </p>
  ));

type Reference = "document" | "guidelines";

const Example = () => {
  const { reference, referenceViewport, moveReference } =
    useReferenceViewport<Reference>("document");
  const [saved, setSaved] = useState(false);
  const labels: Record<Reference, string> = {
    document: "Document",
    guidelines: "Writing guidelines",
  };
  return (
    <ReferenceWorkspace
      header={header}
      toWorkLabel="Go to your notes"
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
        <Stack as="section" aria-label={labels.document} hidden={reference !== "document"}>
          <h2>{labels.document}</h2>
          {paragraphs("Document", 14)}
        </Stack>
        <Stack as="section" aria-label={labels.guidelines} hidden={reference !== "guidelines"}>
          <h2>{labels.guidelines}</h2>
          {paragraphs("Guideline", 4)}
        </Stack>
      </ReferencePane>
      <WorkPane
        as="section"
        label="Notes"
        title="Notes"
        footer={
          <>
            <p role="status">{saved ? "Saved" : "Not saved"}</p>
            <Button onPress={() => setSaved(true)}>Save notes</Button>
          </>
        }
      >
        <Stack>{paragraphs("Working note", 10)}</Stack>
      </WorkPane>
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
    await userEvent.click(canvas.getByRole("button", { name: "Reference material: Document" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Writing guidelines",
      }),
    );
    await expect(canvas.getByRole("region", { name: "Writing guidelines" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save notes" })).toBeVisible();
  },
};

/** Without reference material, the work pane uses the full width. */
export const WorkOnly: Story = {
  render: () => (
    <Frame>
      <ReferenceWorkspace header={header}>
        <WorkPane as="section" label="Request access">
          <Stack>
            <p>Request access to read the document and add your notes.</p>
            <div>
              <Button>Request access</Button>
            </div>
          </Stack>
        </WorkPane>
      </ReferenceWorkspace>
    </Frame>
  ),
};
