import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";

import { StoryEnvironment } from "../../../../tests/storybook";
import { InvitationView } from "./invitation-view";

type Result = ComponentProps<typeof InvitationView>["result"];

const invitation = {
  status: "ok",
  value: {
    organization: { name: "Alder Foundation" },
    administration: "owner",
    role: "program_manager",
    accepted: false,
  },
} satisfies Result;

const InvitationPreview = ({
  result = invitation,
  pending: initiallyPending = false,
  error: initialError = "",
  onAccept,
}: {
  result?: Result;
  pending?: boolean;
  error?: string;
  onAccept: () => Promise<string | null>;
}) => {
  const [pending, setPending] = useState(initiallyPending);
  const [error, setError] = useState(initialError);
  const [accepted, setAccepted] = useState(false);

  return (
    <StoryEnvironment path="/invitations/fictional-preview">
      <InvitationView
        result={
          accepted && result.status === "ok"
            ? { ...result, value: { ...result.value, accepted: true } }
            : result
        }
        token="fictional-preview"
        pending={pending}
        error={error}
        onAccept={async () => {
          setPending(true);
          const failure = await onAccept();
          setError(failure ?? "");
          setAccepted(!failure);
          setPending(false);
        }}
      />
    </StoryEnvironment>
  );
};

const meta = {
  title: "Features/Workspace/Accept invitation",
  tags: ["!autodocs"],
  component: InvitationPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { onAccept: fn<() => Promise<string | null>>(async () => null) },
} satisfies Meta<typeof InvitationPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Owner: Story = {};
export const LongOrganizationName: Story = {
  args: {
    result: {
      ...invitation,
      value: {
        ...invitation.value,
        organization: {
          name: "Community Partnerships for Arts, Education and Neighbourhood Development",
        },
      },
    },
  },
};
export const AdministratorWithoutGrantAccess: Story = {
  args: {
    result: {
      ...invitation,
      value: { ...invitation.value, administration: "administrator", role: "member" },
    },
  },
};
export const ProgramManager: Story = {
  args: { result: { ...invitation, value: { ...invitation.value, administration: "none" } } },
};
export const AlreadyAccepted: Story = {
  args: { result: { ...invitation, value: { ...invitation.value, accepted: true } } },
};
export const Joining: Story = { args: { pending: true } };
export const AcceptanceFailure: Story = {
  args: { error: "The invitation could not be accepted. Please try again." },
};
export const SignedOut: Story = { args: { result: { status: "signed_out" } } };
export const WrongAccount: Story = { args: { result: { status: "wrong_account" } } };
export const Expired: Story = { args: { result: { status: "expired" } } };
export const Revoked: Story = { args: { result: { status: "revoked" } } };
export const Unavailable: Story = { args: { result: { status: "unavailable" } } };
