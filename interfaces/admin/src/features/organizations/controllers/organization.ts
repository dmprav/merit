import { useRef, useState } from "react";

import { invitationEmail } from "@merit/organizations/api";

import type { OrganizationData, OrganizationFailure } from "../contracts";
import { useAdminDrafts } from "./drafts";

type Notice = "nameSaved" | "invitationSaved" | "invitationRevoked";

type UseOrganizationOptions = {
  data: OrganizationData;
  onCommitted: (event: Notice) => void;
  onNameClosed: () => void;
  onInvitationClosed: () => void;
};

export const useOrganization = (options: UseOrganizationOptions) => {
  const { data, onInvitationClosed } = options;
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refresh = async (afterSave = false) => {
    onInvitationClosed();
    try {
      await (afterSave ? data.refreshAfterSave() : data.refresh());
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  };

  const name = useOrganizationName(options, () => setRefreshFailed(true));
  const invitation = useOrganizationInvitation(options, refresh);
  return {
    organization: data.organization,
    busy: data.renaming || data.sending || data.revoking || data.fetching,
    refreshing: data.fetching,
    refreshFailed,
    refresh: () => refresh(),
    name,
    invitation,
  };
};

const useOrganizationName = (
  { data, onNameClosed, onCommitted }: UseOrganizationOptions,
  onRefreshFailed: () => void,
) => {
  const drafts = useAdminDrafts();
  const organization = data.organization;
  const draft = drafts.organizations.get(organization.id);
  const [editingName, setEditingName] = useState(false);

  const saveName = async (name: string): Promise<OrganizationFailure | null> => {
    const result = await data.rename(name);
    if (result.status !== "ok") {
      return result;
    }
    drafts.updateOrganization(organization.id, { name: undefined });
    setEditingName(false);
    onNameClosed();
    onCommitted("nameSaved");
    if (result.refreshFailed) {
      onRefreshFailed();
    }
    return null;
  };

  return {
    ready: drafts.editingReady,
    editing: editingName,
    value: draft?.name ?? organization.name,
    hasDraft: draft?.name !== undefined,
    pending: data.renaming,
    open: () => setEditingName(true),
    change: (name: string) =>
      drafts.updateOrganization(organization.id, {
        name: name === organization.name ? undefined : name,
      }),
    save: saveName,
    cancel: () => {
      if (drafts.editingReady) {
        drafts.updateOrganization(organization.id, { name: undefined });
      }
      setEditingName(false);
      onNameClosed();
    },
  };
};

const useOrganizationInvitation = (
  { data, onCommitted, onInvitationClosed }: UseOrganizationOptions,
  refresh: (afterSave: boolean) => Promise<void>,
) => {
  const drafts = useAdminDrafts();
  const organization = data.organization;
  const draft = drafts.organizations.get(organization.id);
  const invitation = organization.invitation;
  const active = Boolean(invitation && !invitation.revokedAt && !invitation.acceptedAt);
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<OrganizationFailure | null>(null);
  const { send, sendAndReport, revoke } = useInvitationCommands({
    data,
    onCommitted,
    onInvitationClosed,
    drafts,
    organization,
    setReplacement,
    setEditingRecipient,
    setConfirmRevoke,
    setError,
    refresh,
  });

  const closeInvitation = () => {
    setEditingRecipient(false);
    onInvitationClosed();
  };

  return {
    record: invitation,
    active,
    ready: drafts.editingReady,
    editing: editingRecipient,
    value: draft?.email ?? invitation?.email ?? "",
    hasDraft: draft?.email !== undefined,
    sending: data.sending,
    revoking: data.revoking,
    replacement,
    confirmRevoke,
    error,
    open: () => {
      setError(null);
      setEditingRecipient(true);
    },
    close: closeInvitation,
    discard: () => {
      drafts.updateOrganization(organization.id, { email: undefined });
      closeInvitation();
    },
    change: (email: string) =>
      drafts.updateOrganization(organization.id, {
        email: email === (invitation?.email ?? "") ? undefined : email,
      }),
    submit: (email: string) => {
      setError(null);
      if (active && invitationEmail.parse(email) !== invitation?.email) {
        setReplacement(email);
        return Promise.resolve(null);
      }
      return active ? Promise.resolve(null) : send(email);
    },
    resend: () => sendAndReport(invitation?.email),
    requestRevoke: () => {
      setError(null);
      setConfirmRevoke(true);
    },
    changeRevokeOpen: setConfirmRevoke,
    revoke,
    changeReplacementOpen: (open: boolean) => {
      if (!open) {
        onInvitationClosed();
        setReplacement(null);
      }
    },
    replace: () => sendAndReport(replacement),
  };
};

type InvitationCommands = Pick<
  UseOrganizationOptions,
  "data" | "onCommitted" | "onInvitationClosed"
> & {
  drafts: ReturnType<typeof useAdminDrafts>;
  organization: OrganizationData["organization"];
  setReplacement: (value: string | null) => void;
  setEditingRecipient: (value: boolean) => void;
  setConfirmRevoke: (value: boolean) => void;
  setError: (value: OrganizationFailure | null) => void;
  refresh: (afterSave: boolean) => Promise<void>;
};

const useInvitationCommands = ({
  data,
  onCommitted,
  onInvitationClosed,
  drafts,
  organization,
  setReplacement,
  setEditingRecipient,
  setConfirmRevoke,
  setError,
  refresh,
}: InvitationCommands) => {
  const actionInFlight = useRef(false);

  const send = async (email: string): Promise<OrganizationFailure | null> => {
    if (!drafts.editingReady || actionInFlight.current) {
      return null;
    }
    actionInFlight.current = true;
    let failure: OrganizationFailure | null = null;
    try {
      const result = await data.invite(email);
      if (result.status !== "ok") {
        failure = result;
      } else {
        drafts.updateOrganization(organization.id, { email: undefined });
        setReplacement(null);
        setEditingRecipient(false);
        onInvitationClosed();
        onCommitted("invitationSaved");
        await refresh(true);
      }
    } catch {
      failure = { status: "unavailable" };
    }
    actionInFlight.current = false;
    return failure;
  };

  const revoke = async () => {
    if (actionInFlight.current) {
      return;
    }
    actionInFlight.current = true;
    setError(null);
    try {
      const result = await data.revoke();
      if (result.status !== "ok") {
        setError(result);
      } else {
        setConfirmRevoke(false);
        onInvitationClosed();
        onCommitted("invitationRevoked");
        await refresh(true);
      }
    } catch {
      setError({ status: "unavailable" });
    }
    actionInFlight.current = false;
  };

  const sendAndReport = async (email: string | null | undefined) => {
    setError(null);
    if (email) {
      setError(await send(email));
    }
  };

  return { send, sendAndReport, revoke };
};

export type OrganizationController = ReturnType<typeof useOrganization>;
