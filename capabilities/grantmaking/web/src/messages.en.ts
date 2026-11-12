import { intakeMessages } from "@merit/applications-web/message-content";
import { recommendationsMessages } from "@merit/recommendations-web/message-content";
import { reviewStatusMessages } from "@merit/reviews-web/message-content";
import { preparationMessages } from "@merit/rounds-web/message-content";

import { applicationHistoryMessages } from "./views/applications/application-history.messages";
import { applicationsMessages } from "./views/applications/messages.en";
import { creationMessages } from "./views/creation/messages.en";
import { roundsMessages } from "./views/rounds/messages.en";

export const en = {
  draftsRestoring: "Restoring drafts…",
  draftRecoveryConflict:
    "Another tab changed a saved draft. Your edits remain here. Save or discard them before closing this tab.",
  draftRecoveryUnavailable:
    "Draft recovery is unavailable in this browser. Keep this tab open until you save your work.",
  history: applicationHistoryMessages,
  ...intakeMessages,
  ...preparationMessages,
  ...creationMessages,
  ...recommendationsMessages,
  ...applicationsMessages,
  ...roundsMessages,
  journey: {
    title: "Review a revised request",
    application: "Review Workshop Saturdays",
    budget: "Check the round budget",
  },
  demo: {
    readGuide: "Read guide (opens in a new tab)",
    guide: "Demo guide",
    identity: "You’re exploring as {{name}}, a fictional program manager at {{foundation}}.",
    closeGuide: "Close demo guide",
    options: "Demo options",
    exit: "Exit demo",
    exploreTitle: "Try a funding decision",
    exploreHint: "Read an application, compare reviewer assessments, and make a recommendation.",
    scenarioHint:
      "Workshop Saturdays has revised its request. Compare it with the earlier review, update your recommendation, and check the round budget.",
    exploreApplications: "Explore applications",
    loaded: "Your saved recommendations are loaded.",
    loadError: "We couldn’t load saved changes in this browser. Reset the demo to start fresh.",
    saveError: "We couldn’t save in this browser. Your changes are still in this form. Try again.",
    resetSuccess: "Demo reset",
    resetError: "We couldn’t clear this browser’s saved changes. Try again.",
    loading: "Loading this browser’s demo…",
    journeyDescription:
      "Workshop Saturdays journey. Guided and free exploration share this fictional workspace for seven days.",
    description:
      "Explore the demo. Try editing a recommendation and see the allocation change. Your fictional workspace lasts seven days.",
    reset: "Reset demo",
    resetDescription:
      "This restores the original recommendations for this copy of the round. Other demos and workspaces stay unchanged.",
    keepChanges: "Keep my changes",
    resetTitle: "Reset the demo?",
    resetting: "Resetting demo…",
  },
  validation: {
    amountFormat: "Enter an amount with no more than two decimal places, such as 24000.50.",
    amountPrecision: "Enter no more than two decimal places. The amount was not changed.",
    reasoningRequired: "Explain your recommendation.",
    reasoningTooLong: "Keep the reasoning under 5,000 characters.",
    deferralAllocation: "A deferral must reserve €0.",
    positiveAllocation: "Enter an allocation greater than €0.",
    applicationNotFound: "Application not found.",
    allocationTotalTooLarge: "The total proposed allocation is too large.",
    invalid: "Check the recommendation and try again.",
  },
  mode: {
    demo: "Interactive demo with fictional data",
    example: "Read-only fictional example",
    readOnly: "Read only",
  },
  reviews: {
    ...reviewStatusMessages,
    criteriaChanged: "Criteria changed",
    summary:
      "{{submitted}} of {{assigned}} reviews submitted: {{current}} current, {{outdated}} outdated, {{outstanding}} outstanding",
    title: "Before the committee",
  },
  assessmentStatus: {
    current: "current",
    outdated: "Outdated",
    outstanding: "Awaiting review",
  },
} as const;
