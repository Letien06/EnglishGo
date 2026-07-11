import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ApiError, ok } from "@/lib/api/response";
import * as dictation from "@/lib/services/dictation";

export const GET = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const { lessonId, segmentId } = await context.params;
  const maskPercent = Number(new URL(req.url).searchParams.get("maskPercent"));
  if (![30, 50, 100].includes(maskPercent)) throw new ApiError("maskPercent must be 30, 50, or 100.");
  return ok(await dictation.getPrompt(lessonId, segmentId, maskPercent));
});
