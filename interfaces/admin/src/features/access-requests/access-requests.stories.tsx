import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, mocked, within } from "storybook/test";

import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { AccessRequests } from "./access-requests";
import type { AccessRequestsResult } from "./contracts";
import { readAccessRequests, reviewAccessRequest } from "./data/server/access-requests.functions";

const requests: Extract<AccessRequestsResult, { status: "ok" }>["value"]["requests"] = [
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
  return <AccessRequests initialData={{ pages: [initial], pageParams: [null] }} />;
};

const meta = {
  title: "Features/Administration/Access requests",
  tags: ["!autodocs"],
  component: RequestsPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { initial: { status: "ok", value: { requests, nextCursor: null } } },
  decorators: [
    (Story) => (
      <StoryEnvironment path="/admin/access-requests">
        <ApplicationStage>
          <ApplicationPage
            width="full"
            locationKey="access-requests"
            breadcrumb={null}
            breadcrumbLabel="Breadcrumb"
          >
            <Story />
          </ApplicationPage>
        </ApplicationStage>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => {
    let result = structuredClone(args.initial);
    mocked(readAccessRequests)
      .mockReset()
      .mockImplementation(async () => result);
    mocked(reviewAccessRequest)
      .mockReset()
      .mockImplementation(async ({ data }) => {
        const request =
          result.status === "ok"
            ? result.value.requests.find((item) => item.email === data.email)
            : undefined;
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
            value: {
              ...result.value,
              requests: result.value.requests.map((item) =>
                item.email === data.email ? value : item,
              ),
            },
          };
        }
        return { status: "ok", value };
      });
  },
} satisfies Meta<typeof RequestsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewAndReviewed: Story = {};
export const MoreRequests: Story = {
  args: {
    initial: {
      status: "ok",
      value: {
        requests: requests.slice(0, 1),
        nextCursor: { id: "a6d08031-f329-4050-9d4b-e7882679eba1", reviewed: false },
      },
    },
  },
  beforeEach: () => {
    mocked(readAccessRequests)
      .mockRejectedValueOnce(new Error("Next page failed"))
      .mockResolvedValueOnce({
        status: "ok",
        value: {
          requests: requests.map((r) => ({ ...r, reviewedAt: new Date("2026-11-11T10:00:00Z") })),
          nextCursor: null,
        },
      });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Load more requests" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "More requests could not load",
    );
    await expect(canvas.getByText("leah@example.test")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Load more requests" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Load more requests" }));
    await expect(await canvas.findByText("morgan@example.test")).toBeVisible();
    await expect(canvas.getByRole("row", { name: /leah@example\.test/ })).toHaveTextContent(
      "Reviewed",
    );
    await expect(
      canvas.queryByRole("button", { name: "Load more requests" }),
    ).not.toBeInTheDocument();
  },
};
export const AboutRequests: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "About requests" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "About requests",
    });
    await expect(dialog).toHaveTextContent("Email addresses are unverified");
    await expect(dialog).toHaveTextContent("Marking reviewed sends no email and grants no access");
  },
};
export const Empty: Story = {
  args: { initial: { status: "ok", value: { requests: [], nextCursor: null } } },
};
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
  beforeEach: () => {
    mocked(readAccessRequests).mockRejectedValueOnce(new Error("Preview refresh failure"));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark reviewed" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Marked reviewed, but the latest list could not load",
    );
    await expect(canvas.getByRole("button", { name: "Refresh requests" })).toBeEnabled();
    await expect(reviewAccessRequest).toHaveBeenCalledTimes(1);
  },
};
export const Refreshing: Story = {
  beforeEach: () => {
    mocked(readAccessRequests)
      .mockRejectedValueOnce(new Error("Preview refresh failure"))
      .mockImplementationOnce(() => new Promise(() => {}));
  },
  play: async (context) => {
    await SavedButRefreshFailed.play!(context);
    await context.userEvent.click(context.canvas.getByRole("button", { name: "Refresh requests" }));
    await expect(context.canvas.getByRole("button", { name: "Refresh requests" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(reviewAccessRequest).toHaveBeenCalledTimes(1);
  },
};
