import type { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { emptyReviews, reviewStateSchema } from "@merit/reviews/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";

import type { ReviewApplication, ReviewRound } from "../contracts/reviews";

export const makeApplication = ({
  version = 1,
  reviews = emptyReviews(),
}: { version?: number; reviews?: z.input<typeof reviewStateSchema> } = {}): ReviewApplication => ({
  title: "Community project",
  version: materialVersionSchema.parse(version),
  reviews: reviewStateSchema.parse(reviews),
});

const round = fundingRoundSchema.pick({
  criteria: true,
  criteriaVersion: true,
  criteriaHistory: true,
});

export const makeRound = (overrides: Partial<z.input<typeof round>> = {}): ReviewRound =>
  round.parse({
    criteria: [],
    criteriaVersion: 1,
    criteriaHistory: [{ version: 1, criteria: [] }],
    ...overrides,
  });
