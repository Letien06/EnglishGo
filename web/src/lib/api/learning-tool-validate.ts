import { z } from "zod";

const SAFE_DOC_ID = /^[a-zA-Z0-9_.:-]{1,200}$/;

// Use `.default(null)` (instead of `.optional()`) so the inferred types have
// `T | null` — matching the `ProgressRequest` / `ToolRequest` interfaces —
// instead of `T | null | undefined`, which breaks under
// `exactOptionalPropertyTypes: true` during `next build` type checking.
export const progressRequestSchema = z.object({
  requestId: z.uuid().nullable().default(null),
  expectedUid: z.string().trim().min(1).max(128).nullable().default(null),
  answeredAtMillis: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  testId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,200}$/).nullable().default(null),
  part: z.coerce.number().int().min(1).max(7).nullable().default(null),
  level: z.coerce.number().int().min(1).max(10).nullable().default(null),
  itemId: z.string().trim().regex(SAFE_DOC_ID).nullable().default(null),
  questionId: z.string().trim().regex(SAFE_DOC_ID).nullable().default(null),
  selectedAnswer: z.string().trim().max(16).nullable().default(null),
  correctAnswer: z.string().trim().max(16).nullable().default(null),
  modeUsed: z.string().trim().max(32).nullable().default(null),
  assistPercent: z.coerce.number().min(0).max(100).nullable().default(null),
  replayCount: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
  elapsedSeconds: z.coerce.number().min(0).max(86_400).nullable().default(null),
}).refine((request) => Boolean(request.requestId) === Boolean(request.expectedUid), {
  message: "requestId and expectedUid must be supplied together",
  path: ["requestId"],
}).refine((request) => request.answeredAtMillis == null || Boolean(request.requestId), {
  message: "answeredAtMillis requires a requestId",
  path: ["answeredAtMillis"],
});

export const progressBatchRequestSchema = z.object({
  answers: z.array(progressRequestSchema).min(1).max(20),
});

export const toolRequestSchema = z.object({
  testId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,200}$/).nullable().default(null),
  part: z.coerce.number().int().min(1).max(7).nullable().default(null),
  level: z.coerce.number().int().min(1).max(10).nullable().default(null),
  itemId: z.string().trim().regex(SAFE_DOC_ID).nullable().default(null),
  questionId: z.string().trim().regex(SAFE_DOC_ID).nullable().default(null),
  note: z.string().max(4_000).nullable().default(null),
  word: z.string().trim().max(160).nullable().default(null),
  meaning: z.string().trim().max(500).nullable().default(null),
  example: z.string().trim().max(1_000).nullable().default(null),
  favorite: z.coerce.boolean().nullable().default(null),
});
