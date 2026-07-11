import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import * as dictation from "@/lib/services/dictation";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url);
  const lessons = await dictation.listPublishedLessons({
    level: url.searchParams.get("level"), topic: url.searchParams.get("topic"),
    source: url.searchParams.get("source"), duration: url.searchParams.get("duration"),
  });
  return ok({ lessons });
});
