import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const GET = withErrorHandling(async (_req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId }, user] = await Promise.all([context.params, requireUser()]);
  return ok(await dictation.getUserLessonProgress(user.uid, lessonId));
});

export const DELETE = withErrorHandling(async (_req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId }, user] = await Promise.all([context.params, requireUser()]);
  await dictation.resetLessonProgress(user.uid, lessonId);
  return ok({ reset: true });
});
