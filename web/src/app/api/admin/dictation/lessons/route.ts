import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { dictationLessonSchema } from "@/lib/api/dictation-validate";
import { requireRole } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  return ok({ lessons: await dictation.listAdminLessons() });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const [user, body] = await Promise.all([requireRole("ADMIN"), parseBody(req, dictationLessonSchema)]);
  return ok(await dictation.createDraft(body, user.uid), { status: 201 });
});
