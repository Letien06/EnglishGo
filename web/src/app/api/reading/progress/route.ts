/**
 * POST /api/reading/progress — record a reading answer.
 *
 * Port of `ReadingProgressController.postProgress()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ApiError, ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { progressRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as reading from "@/lib/services/reading";
import { practiceHistoryHandler } from "@/lib/api/practice-history";

export const GET = practiceHistoryHandler(5, 7, reading.loadAnswers);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, progressRequestSchema);
  if (body.requestId && !user) throw new ApiError("Đăng nhập lại để đồng bộ đáp án đang chờ lưu.", 401);
  if (body.expectedUid && body.expectedUid !== user?.uid) {
    throw new ApiError("Đáp án đang chờ lưu thuộc tài khoản khác. Hãy đăng nhập đúng tài khoản để đồng bộ.", 403);
  }
  const result = await reading.recordProgress(user?.uid ?? null, body);
  return ok(result);
});
