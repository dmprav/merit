import type { AiReviewer } from "@merit/reviews/domain";

/** A deterministic provider for tests: it cites only the application's title and states one position. */
export const stubAiReviewer: AiReviewer = {
  provider: "OpenAI",
  model: "eval-model",
  review: async ({ input }) => ({
    criteria: (input.criteria.length > 0 ? input.criteria.map(({ id }) => id) : [null]).map(
      (criterionId) => ({
        criterionId,
        claims: [
          {
            text: `${input.application.title} is a community project.`,
            citations: [{ source: "title", quote: input.application.title }],
          },
        ],
        gaps: ["No volunteer rota is described."],
        strengths: [],
        weaknesses: [],
        concerns: [],
      }),
    ),
    questions: ["Who will run the volunteer rota?"],
    reasoning: "A sound idea whose delivery plan needs a volunteer rota.",
    position: "Fund with a condition",
    amount: { minorUnits: "20050", currency: "EUR" },
  }),
};
