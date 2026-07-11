import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireRole } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const POST = withErrorHandling(async (_req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId }, user] = await Promise.all([context.params, requireRole("ADMIN")]);
  return ok(await dictation.archiveLesson(lessonId, user.uid));
});
