import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const GET = withErrorHandling(async (_req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const { lessonId } = await context.params;
  const [lesson, user] = await Promise.all([dictation.getPublishedLessonView(lessonId), getCurrentUser()]);
  const progress = user ? await dictation.getUserLessonProgress(user.uid, lessonId) : null;
  return ok({ lesson, progress });
});
