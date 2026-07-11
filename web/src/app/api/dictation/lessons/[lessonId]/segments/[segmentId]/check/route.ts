import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { dictationBlankCheckSchema } from "@/lib/api/dictation-validate";
import * as dictation from "@/lib/services/dictation";

export const POST = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId, segmentId }, body] = await Promise.all([context.params, parseBody(req, dictationBlankCheckSchema)]);
  return ok(await dictation.checkBlankAnswer(lessonId, segmentId, body));
});
