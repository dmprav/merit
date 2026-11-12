import { z } from "zod";

import { moneyDataSchema } from "@merit/money";

import {
  encodeRecommendation as encodeRecord,
  decodeRecommendation as decodeRecord,
} from "../domain/encoding";
import { recommendationSchema, type Recommendation } from "../domain/recommendation";

export const recommendationDataSchema = z.strictObject({
  position: recommendationSchema.shape.position,
  reasoning: recommendationSchema.shape.reasoning,
  author: recommendationSchema.shape.author,
  recorded: recommendationSchema.shape.recorded,
  allocation: moneyDataSchema,
});

export const encodeRecommendation = (value: Recommendation) =>
  recommendationDataSchema.parse(
    encodeRecord({
      position: value.position,
      reasoning: value.reasoning,
      author: value.author,
      recorded: value.recorded,
      allocation: value.allocation,
    }),
  );

export const decodeRecommendation = (input: unknown): Recommendation =>
  decodeRecord(recommendationDataSchema.parse(input));
