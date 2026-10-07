import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const wordIdSchema = z.coerce.number().int().positive();
const reviewSchema = z.union([
  z.object({
    wordId: wordIdSchema,
    quality: z.coerce.number().min(0).max(5),
  }),
  z.object({
    wordId: wordIdSchema,
    mastered: z.literal(true),
  }),
]);

const batchSchema = z.object({
  reviews: z.array(reviewSchema).min(1).max(100),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, batchSchema);
  const reviews = await vocab.reviewBatch(user.uid, body.reviews, body.requestId);
  return ok({ reviews });
});
