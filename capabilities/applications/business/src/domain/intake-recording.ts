import { parseMoney, sum, type Money } from "@merit/money";

import type { IntakeContent } from "./intake";
import type { IntakeApplication } from "./model";
import { materialVersionSchema } from "./versions";

export const newIntakeApplication = (
  id: string,
  input: Pick<IntakeContent, "title"> &
    Partial<Pick<IntakeContent, "applicant" | "requested" | "answers">>,
): IntakeApplication => {
  const amount = input.requested ? parseMoney(input.requested) : null;
  return {
    id,
    title: input.title,
    version: materialVersionSchema.parse(1),
    requested: amount?.ok ? amount.value : null,
    intakeStatus: "in_preparation",
    summary: "",
    evidence: [],
    contactId: null,
    attention: [],
    submission: {
      version: 1,
      organization: input.applicant ?? "",
      answers: input.answers ?? [],
    },
  };
};

export const withIntakeContact = (
  application: IntakeApplication,
  contactId: string | null,
  contact: { name: string; email: string | null } | null,
): IntakeApplication => ({
  ...application,
  contactId,
  submission: {
    ...application.submission,
    version: application.submission?.version ?? application.version,
    answers: application.submission?.answers ?? [],
    contact: contact?.name ?? "",
    contactEmail: contact?.email ?? "",
  },
});

export const requestedTotalProblem = (
  requests: { publicId: string; requested: Money | null }[],
  application: Pick<IntakeApplication, "id" | "requested">,
) => {
  const amounts = requests
    .filter((item) => item.publicId !== application.id)
    .map((item) => item.requested);
  amounts.push(application.requested);
  try {
    sum(amounts.filter((amount) => amount !== null));
    return null;
  } catch (error) {
    if (error instanceof RangeError) {
      return "request_total_too_large" as const;
    }
    throw error;
  }
};
