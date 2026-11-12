import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQuery } from "@tanstack/react-query";
import { expect, mocked, waitFor, within } from "storybook/test";

import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { AccessRequests } from "./access-requests";
import type { AccessRequestsResult } from "./contracts";
import { accessRequestsOptions } from "./data/queries";
import { readAccessRequests, reviewAccessRequest } from "./data/server/access-requests.functions";

const requests: Extract<AccessRequestsResult, { status: "ok" }>["value"] = [
  {
    email: "leah@example.test",
    requestedAt: new Date("2026-11-09T10:00:00Z"),
    reviewedAt: null,
    reviewedBy: null,
  },
  {
    email: "morgan@example.test",
    requestedAt: new Date("2026-11-08T10:00:00Z"),
    reviewedAt: new Date("2026-11-09T12:00:00Z"),
    reviewedBy: "operator",
  },
];

const RequestsPreview = ({ initial }: { initial: AccessRequestsResult }) => {
  const { data } = useQuery({ ...accessRequestsOptions(), initialData: initial });
  return <AccessRequests result={data} />;
};

const meta = {
  title: "Features/Administration/Access requests",
  tags: ["!autodocs"],
  component: RequestsPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { initial: { status: "ok", value: requests } },
  decorators: [
    (Story) => (
      <StoryEnvironment path="/admin/access-requests">
        <ApplicationPage
          locationKey="access-requests"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
        >
          <Story />
        </ApplicationPage>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => {
    let result = structuredClone(args.initial);
    mocked(readAccessRequests).mockImplementation(async () => result);
    mocked(reviewAccessRequest).mockImplementation(async ({ data }) => {
      const request =
        result.status === "ok" ? result.value.find((item) => item.email === data.email) : undefined;
      if (!request) {
        return { status: "not_found" };
      }
      const value = {
        ...request,
        reviewedAt: new Date("2026-11-11T10:00:00Z"),
        reviewedBy: "operator",
      };
      if (result.status === "ok") {
        result = {
          ...result,
          value: result.value.map((item) => (item.email === data.email ? value : item)),
        };
      }
      return { status: "ok", value };
    });
  },
} satisfies Meta<typeof RequestsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewAndReviewed: Story = {};
export const Empty: Story = { args: { initial: { status: "ok", value: [] } } };
export const MarkedReviewed: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark reviewed" }));
    const row = within(canvas.getByRole("row", { name: /leah@example.test/ }));
    await expect(await row.findByText("Reviewed")).toBeVisible();
    await expect(row.queryByRole("button")).not.toBeInTheDocument();
  },
};
export const Saving: Story = {
  beforeEach: () => {
    mocked(reviewAccessRequest).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark reviewed" }));
    await expect(canvas.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  },
};
export const SaveFailure: Story = {
  beforeEach: () => {
    mocked(reviewAccessRequest).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark reviewed" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not be marked reviewed",
    );
    await expect(canvas.getByRole("button", { name: "Mark reviewed" })).toBeEnabled();
  },
};
export const SavedButRefreshFailed: Story = {
  play: async ({ canvas, userEvent }) => {
    mocked(readAccessRequests).mockRejectedValueOnce(new Error("Preview refresh failure"));
    await userEvent.click(canvas.getByRole("button", { name: "Mark reviewed" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Marked reviewed, but the latest list could not load",
    );
    await expect(canvas.getByRole("button", { name: "Refresh requests" })).toBeEnabled();
    await expect(reviewAccessRequest).toHaveBeenCalledTimes(1);
  },
};
export const RefreshRecovery: Story = {
  play: async (context) => {
    await SavedButRefreshFailed.play!(context);
    await context.userEvent.click(context.canvas.getByRole("button", { name: "Refresh requests" }));
    await waitFor(() => expect(context.canvas.queryByRole("alert")).not.toBeInTheDocument());
    await expect(reviewAccessRequest).toHaveBeenCalledTimes(1);
  },
};
