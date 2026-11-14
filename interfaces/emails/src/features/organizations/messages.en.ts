export const en = {
  subject: "Join {{organizationName}} on Merit",
  preview: "You’ve been invited to join {{organizationName}} on Merit.",
  title: "Join {{organizationName}}",
  introduction: "You’ve been invited to join its workspace on Merit.",
  responsibilities: "Your responsibilities",
  administration: {
    label: "Administration",
    owner: "Organization owner",
    administrator: "Organization administrator",
    none: "No organization administration",
  },
  grantWork: {
    label: "Grant work",
    program_manager: "Program manager (access to grant work)",
    member: "No grant-work access",
    reviewer: "Reviewer (assigned applications only)",
  },
  recipient: "This invitation is for <recipient>{{email}}</recipient>.",
  review: "Review invitation",
  expiry: "This invitation expires on {{date}} UTC.",
  fallbackLink: "If the button doesn’t work, open this link:",
  unexpected: "If you were not expecting this invitation, you can ignore it.",
} as const;
