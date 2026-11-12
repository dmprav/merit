export const en = {
  request: {
    resume: "Resume invitation request",
    discard: "Discard draft",
    submitting: "Submitting request…",
    title: "Request an invitation",
    prototype:
      "Merit is a portfolio project, not a live grant-management service. Request an invitation to explore a workspace with sample data.",
    email: "Email address",
    privacy: "Privacy notice",
    privacyNewTab: "Privacy notice (opens in a new tab)",
    submit: "Submit request",
    close: "Close",
    saved: "Request saved. The project owner may email you about access.",
    error: "Your request could not be saved. Please try again.",
    limited: "Too many requests from this connection. Please try again in an hour.",
  },
  choose: "Choose a workspace",
  switch: "Switch workspace",
  invitation: "Organization invitation",
  invitationDescription:
    "You are invited to join {{organization}} with the following responsibilities.",
  responsibility: {
    owner: {
      label: "Organization owner",
      description: "Manage membership and appoint administrators.",
    },
    administrator: {
      label: "Organization administrator",
      description: "Manage membership and grant access.",
    },
    none: {
      label: "Organization member",
      description: "No membership-management responsibilities.",
    },
  },
  grantAccess: {
    label: "Program manager",
    description: "Access to the organization’s grant work.",
  },
  noGrantAccessLabel: "No grant-work access",
  noGrantAccess: "This invitation does not grant access to grant work.",
  accept: "Accept invitation",
  accepting: "Joining…",
  continue: "Open workspace",
  accepted: "You have already accepted this invitation.",
  signIn: "Sign in",
  signInDescription:
    "Use the email address that received the invitation. Signing in does not join the organization until you accept.",
  signedInAs: "Signed in as {{email}}",
  signedIn: "You’re signed in.",
  switchAccountHelp: "You’ll be signed out before choosing another account.",
  signOutFailed: "We couldn’t sign you out. Please try again.",
  continueSignIn: "Continue",
  switchAccount: "Switch account",
  loading: "Loading invitation…",
  retry: "Try again",
  back: "My workspaces",
  invitationUnavailable: "Invitation unavailable",
  invitationTitles: {
    signed_out: "Sign in to review this invitation",
    expired: "Invitation expired",
    revoked: "Invitation no longer active",
    wrong_account: "Use the invited account",
  },
  errors: {
    invitation_cooldown: "Wait one minute after the last invitation to this email, then try again.",
    invitation_hourly_limit:
      "This organization has reached its limit of 20 invitations per hour. Try again later.",
    invitation_daily_limit:
      "This organization has reached its limit of 100 invitations per day. Try again later.",
    conflict: "The record changed. Refresh and try again.",
    invitation_exists: "An invitation already exists for this email.",
    owner_protected: "Contact the Merit operator for ownership changes.",
    self_change: "You cannot relinquish your own administration here.",
    signed_out: "Sign in to review this invitation.",
    unavailable: "The invitation could not be loaded. Please try again.",
    forbidden: "Your account no longer has access through this invitation.",
    not_found: "This invitation is not available. Ask the person who invited you for a new link.",
    address_taken: "This workspace address is already in use.",
    invalid_input: "Check the invitation link and try again.",
    already_joined: "The administrator has already joined.",
    expired: "This invitation has expired. Ask the person who invited you to resend it.",
    revoked:
      "This invitation was revoked or replaced. Use the latest email or request a new invitation.",
    wrong_account:
      "This invitation is for a different email address. Switch to the invited account or contact the person who invited you.",
    disabled: "This account is disabled. Contact the Merit operator.",
    membership_conflict:
      "Your account already has different access to this organization. Contact the Merit operator.",
  },
} as const;
