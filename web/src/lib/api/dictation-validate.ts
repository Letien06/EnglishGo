import { z } from "zod";

const mask = z.union([z.literal(30), z.literal(50), z.literal(100)]);

export const dictationAttemptSchema = z.object({
  maskPercent: z.coerce.number().pipe(mask),
  blankAnswers: z.record(z.string(), z.string().max(120)).nullable().default(null),
  fullAnswer: z.string().max(1000).nullable().default(null),
  replayCount: z.coerce.number().int().min(0).max(100).default(0),
  hintCount: z.coerce.number().int().min(0).max(100).default(0),
  elapsedSeconds: z.coerce.number().int().min(0).max(3600).default(0),
});

export const dictationBlankCheckSchema = z.object({
  maskPercent: z.coerce.number().pipe(mask).refine((value) => value !== 100, "Blank checks are only available for masked prompts."),
  blankId: z.string().regex(/^b\d{2,3}$/),
  answer: z.string().max(120).default(""),
});

export const dictationLessonSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  sourceName: z.string().trim().min(1).max(120),
  sourceType: z.enum(["PARTNER_PERMISSION", "CC_BY", "PUBLIC_DOMAIN", "NC_LICENSE", "OTHER_LICENSE"]),
  sourceUrl: z.string().url(),
  youtubeVideoId: z.string().trim().min(6).max(32).regex(/^[A-Za-z0-9_-]+$/),
  thumbnailUrl: z.string().url().nullable().default(null),
  durationSeconds: z.coerce.number().int().positive().max(4 * 60 * 60),
  level: z.enum(["A2", "B1", "B2", "C1"]),
  topics: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  publicAttribution: z.string().trim().min(1).max(500),
  transcriptOrigin: z.string().trim().max(120).default("RIGHTS_HOLDER_FILE"),
  descriptionVi: z.string().trim().max(1000).nullable().default(null),
  licenseStatus: z.enum(["PENDING", "VERIFIED", "EXPIRED"]).default("PENDING"),
  rightsEvidenceNote: z.string().trim().min(1).max(2000),
});

export const transcriptImportSchema = z.object({ transcript: z.string().min(1).max(300_000) });

const batchSegmentSchema = z.object({
  startSeconds: z.coerce.number().min(0).max(4 * 60 * 60),
  endSeconds: z.coerce.number().positive().max(4 * 60 * 60),
  expectedText: z.string().trim().min(1).max(1_200),
});

export const dictationBatchImportSchema = z.object({
  lessons: z.array(dictationLessonSchema.extend({
    licenseStatus: z.literal("VERIFIED"),
    segments: z.array(batchSegmentSchema).min(1).max(400),
  })).min(1).max(8),
});
