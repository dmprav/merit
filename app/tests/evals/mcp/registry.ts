import { applicationReadCases } from "./workflows/application-reads.cases.ts";
import { contactCases } from "./workflows/contacts.cases.ts";
import { discoveryCases } from "./workflows/discovery.cases.ts";
import { intakeCases } from "./workflows/intake.cases.ts";
import { invitationCases } from "./workflows/invitations.cases.ts";
import { paperReviewCases } from "./workflows/paper-reviews.cases.ts";
import { recommendationCases } from "./workflows/recommendations.cases.ts";
import { reviewRequestCases } from "./workflows/review-requests.cases.ts";
import { reviewerCases } from "./workflows/reviewer.cases.ts";
import { roundCases } from "./workflows/rounds.cases.ts";

export const evalCases = [
  ...roundCases,
  ...discoveryCases,
  ...intakeCases,
  ...applicationReadCases,
  ...contactCases,
  ...paperReviewCases,
  ...invitationCases,
  ...reviewerCases,
  ...reviewRequestCases,
  ...recommendationCases,
];
