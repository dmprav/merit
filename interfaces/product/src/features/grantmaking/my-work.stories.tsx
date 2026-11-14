import type { Meta, StoryObj } from "@storybook/react-vite";
import { mocked } from "storybook/test";

import { StoryEnvironment } from "../../../tests/storybook";
import { AppShell } from "../../app/app-shell";
import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import { listReviewerAssignments } from "./data/server/reviews/reviewer.functions";
import { workAssignments } from "./my-work.fixtures";
import { MyWorkPage } from "./reviewer-page";

const workspace = {
  id: "alder",
  slug: "alder",
  name: "Alder Foundation",
  kind: "standard" as const,
  canWorkOnGrants: false,
  canViewTeam: false,
};

const MyWorkPreview = ({ manager = false }: { empty?: boolean; manager?: boolean }) => {
  const current = { ...workspace, canWorkOnGrants: manager, canViewTeam: manager };
  return (
    <StoryEnvironment path="/app/alder/work">
      <WorkspaceNavigationContext
        value={{
          workspaces: [
            current,
            { ...current, id: "birch", slug: "birch", name: "Birch Foundation" },
          ],
          canAdminister: false,
        }}
      >
        <AppShell current={{ kind: "workspace", workspace: current }}>
          <MyWorkPage workspaceSlug="alder" />
        </AppShell>
      </WorkspaceNavigationContext>
    </StoryEnvironment>
  );
};

const meta = {
  title: "Features/Workspace/My work",
  component: MyWorkPreview,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  beforeEach: ({ args }) => {
    mocked(listReviewerAssignments).mockResolvedValue({
      status: "ok",
      value: args.empty ? [] : workAssignments,
    });
  },
} satisfies Meta<typeof MyWorkPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reviewer: Story = {};
export const Empty: Story = { args: { empty: true } };
export const ProgramManager: Story = { args: { manager: true } };

export const LongTitles: Story = {
  beforeEach: () => {
    mocked(listReviewerAssignments).mockResolvedValue({
      status: "ok",
      value: workAssignments.map((assignment, index) =>
        index === 0
          ? {
              ...assignment,
              applicationTitle:
                "A welcoming table: shared meals and practical support for isolated neighbours",
              applicant: "North and East Neighbourhood Partnership for Community Wellbeing",
            }
          : assignment,
      ),
    });
  },
};
