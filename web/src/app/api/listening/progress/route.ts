/**
 * POST /api/listening/progress — record a listening answer.
 *
 * Port of `ListeningProgressController.postProgress()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { progressRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as listening from "@/lib/services/listening";
import { practiceHistoryHandler } from "@/lib/api/practice-history";

export const GET = practiceHistoryHandler(1, 4, listening.loadAnswers);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, progressRequestSchema);
  const result = await listening.recordProgress(user?.uid ?? null, body);
  return ok(result);
});
