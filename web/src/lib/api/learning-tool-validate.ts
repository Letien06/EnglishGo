import { z } from "zod";

export const progressRequestSchema = z.object({
  part: z.coerce.number().nullable().optional(),
  level: z.coerce.number().nullable().optional(),
  itemId: z.string().nullable().optional(),
  questionId: z.string().nullable().optional(),
  selectedAnswer: z.string().nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  modeUsed: z.string().nullable().optional(),
  assistPercent: z.coerce.number().nullable().optional(),
  replayCount: z.coerce.number().nullable().optional(),
  elapsedSeconds: z.coerce.number().nullable().optional(),
});

export const toolRequestSchema = z.object({
  part: z.coerce.number().nullable().optional(),
  level: z.coerce.number().nullable().optional(),
  itemId: z.string().nullable().optional(),
  questionId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  word: z.string().nullable().optional(),
  meaning: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
});
