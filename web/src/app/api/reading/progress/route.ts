/**
 * POST /api/reading/progress — record a reading answer.
 *
 * Port of `ReadingProgressController.postProgress()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { progressRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as reading from "@/lib/services/reading";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, progressRequestSchema);
  const result = await reading.recordProgress(user?.uid ?? null, body);
  return ok(result);
});
