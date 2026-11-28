import type { ContactGrantWork } from "../src/server/grant-work";

export const noContactGrantWork: ContactGrantWork = {
  applications: { applicationLinks: async () => [] },
  reviews: { applicationLinks: async () => [], outstandingRequests: async () => [] },
};
