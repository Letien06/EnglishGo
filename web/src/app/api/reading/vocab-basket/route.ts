/**
 * POST /api/reading/vocab-basket — add a word to the reading vocab basket.
 *
 * Port of `ReadingProgressController.postVocabBasket()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { toolRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as reading from "@/lib/services/reading";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, toolRequestSchema);
  const result = await reading.addVocab(user?.uid ?? null, body);
  return ok(result);
});
