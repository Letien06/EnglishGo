import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { transcriptImportSchema } from "@/lib/api/dictation-validate";
import { requireRole } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const POST = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId }, user, body] = await Promise.all([context.params, requireRole("ADMIN"), parseBody(req, transcriptImportSchema)]);
  return ok(await dictation.importTranscript(lessonId, body.transcript, user.uid));
});
