import { preparationMessages } from "./views/preparation/messages.en";

export const en = {
  ...preparationMessages,
  editor: {
    saving: "Saving…",
  },
  budget: {
    total: "Round budget",
  },
  round: {
    purpose: "Purpose",
    committeeDate: "Committee date",
    criteria: "Assessment criteria",
    noCriteria: "No assessment criteria set.",
    status: "Status",
  },
  validation: {
    amountFormat: "Enter an amount with no more than two decimal places, such as 24000.50.",
  },
} as const;
