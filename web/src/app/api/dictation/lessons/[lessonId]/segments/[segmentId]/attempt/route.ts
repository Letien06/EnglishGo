import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { dictationAttemptSchema } from "@/lib/api/dictation-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const POST = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId, segmentId }, body, user] = await Promise.all([context.params, parseBody(req, dictationAttemptSchema), getCurrentUser()]);
  return ok(await dictation.submitAttempt(user?.uid ?? null, lessonId, segmentId, body));
});
