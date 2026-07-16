import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalList = (maxItems: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(maxItems).optional();

export const writingPromptSchema = z.object({
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).optional(),
  title: z.string().trim().min(1).max(180),
  titleVi: optionalText(220),
  summary: optionalText(900),
  instructions: optionalText(4_000),
  promptText: optionalText(8_000),
  tags: optionalList(12, 50),
  part1Category: z.enum(["N_N", "V_N", "N_PREP", "V_PREP"]).nullable().optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(60).optional(),
  // Both a bundled /public path and a vetted remote URL are accepted here.
  imageUrl: z.string().trim().max(2_000).nullable().optional(),
  imageAlt: optionalText(500).nullable().optional(),
  requiredTerms: optionalList(12, 120),
  taskChecklist: optionalList(10, 600),
  responseRules: z.object({
    minWords: z.coerce.number().int().min(0).max(2_000).optional(),
    recommendedWords: z.coerce.number().int().min(0).max(2_000).optional(),
    maxWords: z.coerce.number().int().min(0).max(2_000).optional(),
    minSentences: z.coerce.number().int().min(0).max(100).optional(),
    maxSentences: z.coerce.number().int().min(0).max(100).optional(),
  }).optional(),
  hints: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1_200),
    level: z.coerce.number().int().min(1).max(3).optional(),
  })).max(5).optional(),
  sampleAnswers: z.array(z.object({
    answer: z.string().trim().min(1).max(12_000),
    translationVi: optionalText(12_000),
    notes: optionalText(1_200),
  })).max(4).optional(),
  planTemplate: optionalList(12, 600),
  email: z.object({
    fromName: optionalText(160),
    toName: optionalText(160),
    subject: optionalText(300),
    body: optionalText(8_000),
    signature: optionalText(300),
  }).nullable().optional(),
  gradingTargets: z.object({
    topicKeywords: optionalList(20, 100),
    requiredIdeas: optionalList(12, 600),
  }).optional(),
});

export const writingPromptPatchSchema = writingPromptSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  "Cần gửi ít nhất một trường để cập nhật.",
);
