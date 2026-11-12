import { intakeMessages } from "./views/intake/messages.en";

export const en = {
  ...intakeMessages,
  contactSelection: {
    changeContactValue: "Change contact: {{name}}",
    changeContact: "Change contact",
    contact: "Applicant contact",
    close: "Close",
    saved: "Saved",
    retry: "Retry",
    refreshError: "Saved, but the latest information could not be loaded. Refresh to see it.",
    refreshReadError:
      "The latest information could not be loaded. Try again to review current work.",
    accessLost: "This workspace is no longer available to you.",
  },
  preparation: {
    close: "Close",
    discard: "Discard changes",
    saveName: "Save name",
    undo: "Undo",
    accessLost: "You no longer have access to change this round. Your draft is still here.",
  },
  creation: {
    titleRequired: "Enter a project title.",
  },
  editor: {
    saving: "Saving…",
  },
  workspace: {
    details: "Application details",
    submission: "Applicant submission",
    version: "Version {{version}}",
  },
  evidence: {
    projectPeriod: "Project dates",
    submittedOn: "Submitted",
    unavailable: "The submitted application is not available here yet.",
  },
  applications: {
    requestAmount: "{{amount}} requested",
  },
} as const;
