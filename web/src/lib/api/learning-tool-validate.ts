import { z } from "zod";

// Use `.default(null)` (instead of `.optional()`) so the inferred types have
// `T | null` — matching the `ProgressRequest` / `ToolRequest` interfaces —
// instead of `T | null | undefined`, which breaks under
// `exactOptionalPropertyTypes: true` during `next build` type checking.
export const progressRequestSchema = z.object({
  part: z.coerce.number().nullable().default(null),
  level: z.coerce.number().nullable().default(null),
  itemId: z.string().nullable().default(null),
  questionId: z.string().nullable().default(null),
  selectedAnswer: z.string().nullable().default(null),
  correctAnswer: z.string().nullable().default(null),
  modeUsed: z.string().nullable().default(null),
  assistPercent: z.coerce.number().nullable().default(null),
  replayCount: z.coerce.number().nullable().default(null),
  elapsedSeconds: z.coerce.number().nullable().default(null),
});

export const toolRequestSchema = z.object({
  part: z.coerce.number().nullable().default(null),
  level: z.coerce.number().nullable().default(null),
  itemId: z.string().nullable().default(null),
  questionId: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  word: z.string().nullable().default(null),
  meaning: z.string().nullable().default(null),
  example: z.string().nullable().default(null),
  favorite: z.coerce.boolean().nullable().default(null),
});
