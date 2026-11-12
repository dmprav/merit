import { recommendationsMessages } from "./views/recommendations/messages.en";

export const en = {
  ...recommendationsMessages,
  intake: {
    defer: "Defer application",
    deferFor: "Defer application: {{title}}",
    fundingNotReady:
      "Mark the application ready before recommending funding. You can record a deferral while information is missing.",
  },
  preparation: {
    close: "Close",
    discard: "Discard changes",
  },
  workspace: {
    basis: "Submission v{{version}}",
    earlierBasis: "Earlier submission v{{version}}",
  },
  applications: {
    notRecommended: "Not yet recommended",
    proposedAmount: "{{amount}} proposed",
    recommendation: "Manager recommendation",
    noAllocation: "No funding proposed",
  },
  assessments: {
    amountNotStated: "Proposed amount: Not stated",
    positionNotStated: "Funding position: Not stated",
    version: "{{date}} · v{{version}}",
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
} as const;
