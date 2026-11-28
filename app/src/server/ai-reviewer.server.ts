import { z } from "zod";

import type { AiReviewer } from "@merit/reviews/domain";

import { openAiProvider, requestChatCompletion } from "./openai-request.server";

const completion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().min(1) }),
      }),
    )
    .length(1),
});

/** The single-shot structured-output call behind an AI review; null when no key or model is set. */
export const createOpenAiReviewer = (config: {
  apiKey: string;
  model: string;
}): AiReviewer | undefined =>
  config.apiKey && config.model
    ? {
        provider: openAiProvider,
        model: config.model,
        review: async ({ instructions, input, outputSchema, signal }) => {
          const reply = await requestChatCompletion(
            config,
            {
              max_completion_tokens: 16384,
              response_format: {
                type: "json_schema",
                json_schema: { name: "ai_review", strict: true, schema: outputSchema },
              },
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: JSON.stringify(input) },
              ],
            },
            signal,
          );
          const [choice] = completion.parse(reply).choices;
          // The caller verifies the content; a truncated or refused reply never parses here.
          const parsed: unknown = JSON.parse(choice?.message.content ?? "");
          return parsed;
        },
      }
    : undefined;
